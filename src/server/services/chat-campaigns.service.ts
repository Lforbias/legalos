import { z } from "zod";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { normalizeWaId } from "@/lib/whatsapp/phone";
import { assertCan, can, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { assertModule } from "./org-security.service";
import { systemSendTemplate, systemSendText, windowAllowsText } from "./whatsapp.service";

/**
 * 4.0-F7 — campanhas em massa CONTROLADAS.
 * REGRAS: (1) desligado por padrão (chave "Campanhas em massa" + módulo do plano); (2) nada sai sem uma PESSOA com permissão de gerenciar o Chat APROVAR;
 * (3) quem pediu para sair (PARAR) nunca recebe; (4) na API oficial da Meta só modelo aprovado; (5) envio GRADUAL (lote por minuto), nunca de uma vez;
 * (6) máximo de 10.000 destinatários; (7) desligar a chave pausa na hora; (8) relatório de entrega por destinatário.
 */

export const MAX_RECIPIENTS = 10_000;
export const BATCH_PER_RUN = 20;
export const CAMPAIGN_STATUS_LABEL: Record<string, string> = { DRAFT: "Rascunho (aguardando aprovação)", APPROVED: "Aprovada (na fila de envio)", SENDING: "Enviando", PAUSED: "Pausada", DONE: "Concluída", CANCELED: "Cancelada" };

const schema = z.object({
  name: z.string().trim().min(3, "Nome: mínimo 3 caracteres.").max(80),
  text: z.string().trim().min(3, "Escreva a mensagem.").max(1000, "Mensagem: no máximo 1000 caracteres."),
  templateId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  clientIds: z.array(z.string().uuid()).max(MAX_RECIPIENTS, `No máximo ${MAX_RECIPIENTS} clientes por campanha.`).default([]),
  allMatching: z.boolean().default(false),
  query:z.string().trim().max(80).default(""),
  clientTag:z.string().trim().max(80).default(""),
  clientStatus:z.enum(["ACTIVE","INACTIVE","PROSPECT"]).optional(),
  imported:z.array(z.object({name:z.string().trim().min(1).max(160),phone:z.string().trim().max(30)})).max(MAX_RECIPIENTS).default([]),
  importConsent:z.boolean().default(false),
  scheduledAt: z.coerce.date().nullable().optional(),
});

async function gate(ctx: TenantContext, perm: "whatsapp:read" | "whatsapp:write" | "whatsapp:manage") {
  assertCan(ctx, perm);
  await assertModule(ctx.organizationId, "campanhas");
}

async function requireEnabled(organizationId: string) {
  const s = await db.whatsappExtrasSettings.findUnique({ where: { organizationId }, select: { campaignsEnabled: true } });
  if (!s?.campaignsEnabled) throw new ConflictError("As campanhas em massa estão desligadas. Quem administra o Chat precisa ligar a chave em Configurações do Chat.");
}

const providerKind = async (organizationId: string, accountId: string) => (await db.whatsappAccount.findFirst({ where: { id: accountId, organizationId }, select: { provider: true } }))?.provider ?? null;

export async function listCampaigns(ctx: TenantContext) {
  await gate(ctx, "whatsapp:read");
  const rows = await db.whatsappCampaign.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: 50 });
  const counts = await db.whatsappCampaignRecipient.groupBy({ by: ["campaignId", "status"], where: { campaignId: { in: rows.map((r) => r.id) } }, _count: true });
  return rows.map((r) => {
    const c: Record<string, number> = {};
    for (const x of counts) if (x.campaignId === r.id) c[x.status] = x._count;
    return { ...r, counts: { PENDING: c.PENDING ?? 0, SENT: c.SENT ?? 0, FAILED: c.FAILED ?? 0, SKIPPED: c.SKIPPED ?? 0, UNKNOWN:c.UNKNOWN??0 } };
  });
}

export async function campaignReport(ctx: TenantContext, id: string,pageInput=1) {
  await gate(ctx, "whatsapp:read");
  const c = await db.whatsappCampaign.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!c) throw new NotFoundError("Campanha não encontrada.");
  const page=Math.max(1,Math.min(10000,Math.floor(pageInput)));
  const [total,recipients]=await Promise.all([db.whatsappCampaignRecipient.count({where:{campaignId:id}}),db.whatsappCampaignRecipient.findMany({ where: { campaignId: id }, orderBy: [{ status: "asc" }, { name: "asc" },{id:"asc"}],skip:(page-1)*100,take:100 })]);
  return { campaign: c, recipients,total,page,pages:Math.max(1,Math.ceil(total/100)) };
}

export async function createCampaign(ctx: TenantContext, raw: unknown) {
  await gate(ctx, "whatsapp:write");
  await requireEnabled(ctx.organizationId);
  const p = schema.safeParse(raw);
  if (!p.success) throw new ValidationError("Confira os campos.", p.error.flatten().fieldErrors as Record<string, string[]>);
  const d = p.data;
  if(d.imported.length&&!d.importConsent)throw new ValidationError("Confirme a autorização dos contatos importados antes de criar o rascunho.");
  if(d.imported.length+d.clientIds.length>MAX_RECIPIENTS||d.allMatching&&d.imported.length)throw new ValidationError("Importação e seleção por filtro devem ser campanhas separadas, até 10.000 contatos.");
  if(!d.allMatching&&!d.clientIds.length&&!d.imported.length)throw new ValidationError("Escolha ao menos um cliente.");
  assertCan(ctx,"clients:read");
  const account = d.accountId ? await db.whatsappAccount.findFirst({ where: { id: d.accountId, organizationId: ctx.organizationId, enabled: true }, select: { id: true, provider: true } }) : await db.whatsappAccount.findFirst({ where: { organizationId: ctx.organizationId, isPrimary: true, enabled: true }, select: { id: true, provider: true } });
  if (!account) throw new ConflictError("Nenhum número de WhatsApp conectado para enviar a campanha.");
  if (account.provider !== "QR") {
    if (!d.templateId) throw new ValidationError("Na conexão oficial da Meta, campanhas só saem com um modelo aprovado.", { templateId: ["Escolha um modelo aprovado."] });
    const t = await db.whatsappTemplate.findFirst({ where: { id: d.templateId, organizationId: ctx.organizationId, status: "APPROVED" }, select: { id: true } });
    if (!t) throw new ValidationError("Modelo inexistente ou não aprovado.", { templateId: ["Modelo não aprovado."] });
  }
  if (d.scheduledAt && d.scheduledAt.getTime() < Date.now() - 60_000) throw new ValidationError("O horário já passou.", { scheduledAt: ["Escolha um horário futuro."] });
  const clients = await db.client.findMany({ where: { ...(d.allMatching?{phone:{not:null},...(d.query?{name:{contains:d.query,mode:"insensitive" as const}}:{}),...(d.clientTag?{tags:{has:d.clientTag}}:{}),...(d.clientStatus?{status:d.clientStatus}:{})}:{id:{in:d.clientIds}}), organizationId: ctx.organizationId, deletedAt: null }, select: { id: true, name: true, phone: true },take:MAX_RECIPIENTS+1,orderBy:{id:"asc"} });
  if(clients.length>MAX_RECIPIENTS)throw new ValidationError(`O filtro tem mais de ${MAX_RECIPIENTS} clientes. Refine a busca.`);
  if(!d.allMatching&&clients.length!==new Set(d.clientIds).size)throw new ValidationError("Há clientes indisponíveis na seleção. Atualize a lista.");
  if (clients.length === 0 && !d.imported.length) throw new ValidationError("Nenhum cliente válido.", { clientIds: ["Nenhum cliente válido."] });
  const optouts = new Set((await db.whatsappBillingOptout.findMany({ where: { organizationId: ctx.organizationId }, select: { waId: true } })).map((o) => o.waId));
  const seen = new Set<string>();
  const rows: { organizationId: string; clientId: string|null; waId: string; name: string; status: string; error: string | null }[] = [];
  for (const c of clients) {
    const waId = c.phone ? normalizeWaId(c.phone) : null;
    if (!waId) { rows.push({ organizationId: ctx.organizationId, clientId: c.id, waId: `sem-telefone:${c.id}`, name: c.name, status: "SKIPPED", error: "sem telefone válido" }); continue; }
    if (seen.has(waId)) continue;
    seen.add(waId);
    rows.push({ organizationId: ctx.organizationId, clientId: c.id, waId, name: c.name, status: optouts.has(waId) ? "SKIPPED" : "PENDING", error: optouts.has(waId) ? "pediu para não receber mensagens" : null });
  }
  for(const contact of d.imported) {
    const waId=normalizeWaId(contact.phone);if(!waId)throw new ValidationError("Telefone importado inválido. Confira a lista.");
    if(seen.has(waId))continue;seen.add(waId);
    rows.push({organizationId:ctx.organizationId,clientId:null,waId,name:contact.name,status:optouts.has(waId)?"SKIPPED":"PENDING",error:optouts.has(waId)?"pediu para não receber mensagens":null});
  }
  const camp = await db.$transaction(async tx=>{
  const made = await tx.whatsappCampaign.create({ data: { organizationId: ctx.organizationId, name: d.name, text: d.text, templateId: d.templateId ?? null, accountId: account.id, scheduledAt: d.scheduledAt ?? null, createdById: ctx.userId, status: "DRAFT" } });
  for(let offset=0;offset<rows.length;offset+=500)await tx.whatsappCampaignRecipient.createMany({ data: rows.slice(offset,offset+500).map((r) => ({ ...r, campaignId: made.id })) });
  return made;
  },{timeout:30000});
  await audit({ action: "whatsapp.campaign_create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_campaign", resourceId: camp.id, metadata: { recipients: rows.length,imported:d.imported.length,importConsent:d.importConsent,clientTag:d.clientTag,clientStatus:d.clientStatus??null }, meta: ctx.meta });
  return camp;
}

export async function approveCampaign(ctx: TenantContext, id: string) {
  await gate(ctx, "whatsapp:manage");
  await requireEnabled(ctx.organizationId);
  const pending = await db.whatsappCampaignRecipient.count({ where: { campaignId: id, organizationId:ctx.organizationId,status: "PENDING" } });
  if (pending === 0) throw new ConflictError("Não há destinatários válidos para enviar.");
  const r = await db.whatsappCampaign.updateMany({ where: { id, organizationId: ctx.organizationId, status: { in: ["DRAFT", "PAUSED"] } }, data: { status: "APPROVED", approvedById: ctx.userId, approvedAt: new Date() } });
  if (r.count !== 1) throw new ConflictError("Só dá para aprovar campanha em rascunho ou pausada.");
  await audit({ action: "whatsapp.campaign_approve", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_campaign", resourceId: id, metadata: { pending }, meta: ctx.meta });
}

export async function pauseCampaign(ctx: TenantContext, id: string) {
  await gate(ctx, "whatsapp:manage");
  const r = await db.whatsappCampaign.updateMany({ where: { id, organizationId: ctx.organizationId, status: { in: ["APPROVED", "SENDING"] } }, data: { status: "PAUSED" } });
  if (r.count !== 1) throw new ConflictError("Só dá para pausar campanha em andamento.");
  await audit({ action: "whatsapp.campaign_pause", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_campaign", resourceId: id, meta: ctx.meta });
}

export async function cancelCampaign(ctx: TenantContext, id: string) {
  await gate(ctx, "whatsapp:write");
  const c = await db.whatsappCampaign.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { createdById: true, status: true } });
  if (!c) throw new NotFoundError("Campanha não encontrada.");
  if (c.createdById !== ctx.userId && !can(ctx, "whatsapp:manage")) throw new ConflictError("Só quem criou ou quem gerencia o Chat pode cancelar.");
  const r = await db.whatsappCampaign.updateMany({ where: { id, organizationId: ctx.organizationId, status: { in: ["DRAFT", "APPROVED", "SENDING", "PAUSED"] } }, data: { status: "CANCELED", finishedAt: new Date() } });
  if (r.count !== 1) throw new ConflictError("A campanha já terminou.");
  await audit({ action: "whatsapp.campaign_cancel", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_campaign", resourceId: id, meta: ctx.meta });
}

/** Rotina (a cada minuto): envia um lote pequeno de cada campanha aprovada. Nunca lança. */
export async function runCampaigns(now = new Date()): Promise<{ sent: number; failed: number; skipped: number; finished: number }> {
  const out = { sent: 0, failed: 0, skipped: 0, finished: 0 };
  const camps = await db.whatsappCampaign.findMany({ where: { status: { in: ["APPROVED", "SENDING"] }, OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] }, take: 50 });
  for (const c of camps) {
    try {
      const s = await db.whatsappExtrasSettings.findUnique({ where: { organizationId: c.organizationId }, select: { campaignsEnabled: true } });
      if (!s?.campaignsEnabled) { await db.whatsappCampaign.updateMany({ where: { id: c.id, status: { in: ["APPROVED", "SENDING"] } }, data: { status: "PAUSED" } }); continue; }
      const claimedBatch=await db.whatsappCampaign.updateMany({where:{id:c.id,status:{in:["APPROVED","SENDING"]},OR:[{lastBatchAt:null},{lastBatchAt:{lte:new Date(now.getTime()-60000)}}]},data:{status:"SENDING",lastBatchAt:now}});
      if(!claimedBatch.count)continue;
      // Interrupção após chamar o provedor pode ter enviado a mensagem. Nunca reenviar automaticamente sem confirmação.
      await db.whatsappCampaignRecipient.updateMany({where:{campaignId:c.id,status:"SENDING",OR:[{claimedAt:null},{claimedAt:{lt:new Date(now.getTime()-10*60000)}}]},data:{status:"UNKNOWN",error:"Envio interrompido; conferir a conversa e o provedor antes de reenviar."}});
      const batch = await db.whatsappCampaignRecipient.findMany({ where: { campaignId: c.id, status: "PENDING" }, orderBy: { name: "asc" }, take: BATCH_PER_RUN });
      for (const r of batch) {
        // pausou/cancelou no meio do lote? para na hora
        if (!(await db.whatsappCampaign.findFirst({ where: { id: c.id, status: "SENDING" }, select: { id: true } }))) break;
        const claimed = await db.whatsappCampaignRecipient.updateMany({ where: { id: r.id, status: "PENDING" }, data: { status: "SENDING",claimedAt:now } });
        if (claimed.count !== 1) continue;
        const res = await sendOne(c, r);
        await db.whatsappCampaignRecipient.update({ where: { id: r.id }, data: { status: res.status, error: res.error, sentAt: res.status === "SENT" ? new Date() : null } });
        if(res.messageId)await db.$executeRaw`UPDATE whatsapp_campaign_recipients SET message_id=${res.messageId}::uuid WHERE id=${r.id}::uuid AND organization_id=${c.organizationId}::uuid`;
        out[res.status === "SENT" ? "sent" : res.status === "FAILED" ? "failed" : "skipped"]++;
      }
      const left = await db.whatsappCampaignRecipient.count({ where: { campaignId: c.id, status: { in: ["PENDING", "SENDING"] } } });
      if (left === 0) {
        const f = await db.whatsappCampaign.updateMany({ where: { id: c.id, status: "SENDING" }, data: { status: "DONE", finishedAt: new Date() } });
        if (f.count === 1) out.finished++;
      }
    } catch (e) {
      logger.error("whatsapp.campaign_failed", { campaignId: c.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

async function sendOne(c: { organizationId: string; accountId: string | null; text: string; templateId: string | null }, r: { clientId: string | null; waId: string; name: string }): Promise<{ status: "SENT" | "FAILED" | "SKIPPED"; error: string | null; messageId?:string }> {
  try {
    if (await db.whatsappBillingOptout.findUnique({ where: { organizationId_waId: { organizationId: c.organizationId, waId: r.waId } }, select: { waId: true } })) return { status: "SKIPPED", error: "pediu para não receber mensagens" };
    if (!c.accountId) return { status: "FAILED", error: "campanha sem número" };
    const acc = await db.whatsappAccount.findFirst({ where: { id: c.accountId, organizationId: c.organizationId, enabled: true }, select: { id: true,provider:true } });
    if (!acc) return { status: "FAILED", error: "número desconectado" };
    const found = await db.whatsappConversation.findUnique({ where: { accountId_waId: { accountId: acc.id, waId: r.waId } }, select: { id: true } });
    const conv = found ?? (await db.whatsappConversation.create({ data: { organizationId: c.organizationId, accountId: acc.id, waId: r.waId, clientId: r.clientId, status: "CLOSED" }, select: { id: true } }));
    const nome = r.name.split(" ")[0] ?? r.name;
    const res = acc.provider!=="QR" ? c.templateId ? await systemSendTemplate(c.organizationId,conv.id,c.templateId,[nome,"-","-","-","-"]) : null : (await windowAllowsText(c.organizationId, conv.id))
      ? await systemSendText(c.organizationId, conv.id, c.text.replace(/\{nome\}/g, nome))
      : c.templateId ? await systemSendTemplate(c.organizationId, conv.id, c.templateId, [nome, "-", "-", "-", "-"]) : null;
    if (!res) return { status: "SKIPPED", error: "fora da janela de 24 h e sem modelo" };
    return res.status === "SENT" ? { status: "SENT", error: null, messageId:res.id } : { status: "FAILED", messageId:res.id, error: (res.error ?? "o WhatsApp recusou o envio").slice(0, 300) };
  } catch (e) {
    if (e instanceof ConflictError || e instanceof ValidationError) return { status: "SKIPPED", error: e.message.slice(0, 300) };
    return { status: "FAILED", error: "falha ao enviar (conexão fora do ar?)" };
  }
}

export { providerKind };

export async function campaignClientOptions(ctx:TenantContext,raw:unknown={}){
 await gate(ctx,"whatsapp:write");assertCan(ctx,"clients:read");
 const v=z.object({q:z.string().trim().max(80).default(""),clientTag:z.string().trim().max(80).default(""),clientStatus:z.enum(["ACTIVE","INACTIVE","PROSPECT"]).optional(),page:z.number().int().min(1).max(10000).default(1)}).parse(raw);
 const where={organizationId:ctx.organizationId,deletedAt:null,phone:{not:null},...(v.clientTag?{tags:{has:v.clientTag}}:{}),...(v.clientStatus?{status:v.clientStatus}:{}),...(v.q?{name:{contains:v.q,mode:"insensitive" as const}}:{})};
 const [total,items]=await Promise.all([db.client.count({where}),db.client.findMany({where,select:{id:true,name:true},orderBy:[{name:"asc"},{id:"asc"}],skip:(v.page-1)*100,take:100})]);
 return {total,items,page:v.page,pages:Math.max(1,Math.ceil(total/100)),maxRecipients:MAX_RECIPIENTS};
}
