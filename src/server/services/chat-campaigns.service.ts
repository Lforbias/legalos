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
 * (6) máximo de 500 destinatários; (7) desligar a chave pausa na hora; (8) relatório de entrega por destinatário.
 */

export const MAX_RECIPIENTS = 500;
export const BATCH_PER_RUN = 20;
export const CAMPAIGN_STATUS_LABEL: Record<string, string> = { DRAFT: "Rascunho (aguardando aprovação)", APPROVED: "Aprovada (na fila de envio)", SENDING: "Enviando", PAUSED: "Pausada", DONE: "Concluída", CANCELED: "Cancelada" };

const schema = z.object({
  name: z.string().trim().min(3, "Nome: mínimo 3 caracteres.").max(80),
  text: z.string().trim().min(3, "Escreva a mensagem.").max(1000, "Mensagem: no máximo 1000 caracteres."),
  templateId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  clientIds: z.array(z.string().uuid()).min(1, "Escolha ao menos um cliente.").max(MAX_RECIPIENTS, `No máximo ${MAX_RECIPIENTS} clientes por campanha.`),
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
    return { ...r, counts: { PENDING: c.PENDING ?? 0, SENT: c.SENT ?? 0, FAILED: c.FAILED ?? 0, SKIPPED: c.SKIPPED ?? 0 } };
  });
}

export async function campaignReport(ctx: TenantContext, id: string) {
  await gate(ctx, "whatsapp:read");
  const c = await db.whatsappCampaign.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!c) throw new NotFoundError("Campanha não encontrada.");
  const recipients = await db.whatsappCampaignRecipient.findMany({ where: { campaignId: id }, orderBy: [{ status: "asc" }, { name: "asc" }], take: MAX_RECIPIENTS });
  return { campaign: c, recipients };
}

export async function createCampaign(ctx: TenantContext, raw: unknown) {
  await gate(ctx, "whatsapp:write");
  await requireEnabled(ctx.organizationId);
  const p = schema.safeParse(raw);
  if (!p.success) throw new ValidationError("Confira os campos.", p.error.flatten().fieldErrors as Record<string, string[]>);
  const d = p.data;
  const account = d.accountId ? await db.whatsappAccount.findFirst({ where: { id: d.accountId, organizationId: ctx.organizationId, enabled: true }, select: { id: true, provider: true } }) : await db.whatsappAccount.findFirst({ where: { organizationId: ctx.organizationId, isPrimary: true, enabled: true }, select: { id: true, provider: true } });
  if (!account) throw new ConflictError("Nenhum número de WhatsApp conectado para enviar a campanha.");
  if (account.provider !== "QR") {
    if (!d.templateId) throw new ValidationError("Na conexão oficial da Meta, campanhas só saem com um modelo aprovado.", { templateId: ["Escolha um modelo aprovado."] });
    const t = await db.whatsappTemplate.findFirst({ where: { id: d.templateId, organizationId: ctx.organizationId, status: "APPROVED" }, select: { id: true } });
    if (!t) throw new ValidationError("Modelo inexistente ou não aprovado.", { templateId: ["Modelo não aprovado."] });
  }
  if (d.scheduledAt && d.scheduledAt.getTime() < Date.now() - 60_000) throw new ValidationError("O horário já passou.", { scheduledAt: ["Escolha um horário futuro."] });
  const clients = await db.client.findMany({ where: { id: { in: d.clientIds }, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true, name: true, phone: true } });
  if (clients.length === 0) throw new ValidationError("Nenhum cliente válido.", { clientIds: ["Nenhum cliente válido."] });
  const optouts = new Set((await db.whatsappBillingOptout.findMany({ where: { organizationId: ctx.organizationId }, select: { waId: true } })).map((o) => o.waId));
  const seen = new Set<string>();
  const rows: { organizationId: string; clientId: string; waId: string; name: string; status: string; error: string | null }[] = [];
  for (const c of clients) {
    const waId = c.phone ? normalizeWaId(c.phone) : null;
    if (!waId) { rows.push({ organizationId: ctx.organizationId, clientId: c.id, waId: `sem-telefone:${c.id}`, name: c.name, status: "SKIPPED", error: "sem telefone válido" }); continue; }
    if (seen.has(waId)) continue;
    seen.add(waId);
    rows.push({ organizationId: ctx.organizationId, clientId: c.id, waId, name: c.name, status: optouts.has(waId) ? "SKIPPED" : "PENDING", error: optouts.has(waId) ? "pediu para não receber mensagens" : null });
  }
  const camp = await db.whatsappCampaign.create({ data: { organizationId: ctx.organizationId, name: d.name, text: d.text, templateId: d.templateId ?? null, accountId: account.id, scheduledAt: d.scheduledAt ?? null, createdById: ctx.userId, status: "DRAFT" } });
  await db.whatsappCampaignRecipient.createMany({ data: rows.map((r) => ({ ...r, campaignId: camp.id })) });
  await audit({ action: "whatsapp.campaign_create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_campaign", resourceId: camp.id, metadata: { recipients: rows.length }, meta: ctx.meta });
  return camp;
}

export async function approveCampaign(ctx: TenantContext, id: string) {
  await gate(ctx, "whatsapp:manage");
  await requireEnabled(ctx.organizationId);
  const pending = await db.whatsappCampaignRecipient.count({ where: { campaignId: id, status: "PENDING" } });
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
      await db.whatsappCampaign.updateMany({ where: { id: c.id, status: "APPROVED" }, data: { status: "SENDING" } });
      const batch = await db.whatsappCampaignRecipient.findMany({ where: { campaignId: c.id, status: "PENDING" }, orderBy: { name: "asc" }, take: BATCH_PER_RUN });
      for (const r of batch) {
        // pausou/cancelou no meio do lote? para na hora
        if (!(await db.whatsappCampaign.findFirst({ where: { id: c.id, status: "SENDING" }, select: { id: true } }))) break;
        const claimed = await db.whatsappCampaignRecipient.updateMany({ where: { id: r.id, status: "PENDING" }, data: { status: "SENDING" } });
        if (claimed.count !== 1) continue;
        const res = await sendOne(c, r);
        await db.whatsappCampaignRecipient.update({ where: { id: r.id }, data: { status: res.status, error: res.error, sentAt: res.status === "SENT" ? new Date() : null } });
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

async function sendOne(c: { organizationId: string; accountId: string | null; text: string; templateId: string | null }, r: { clientId: string | null; waId: string; name: string }): Promise<{ status: "SENT" | "FAILED" | "SKIPPED"; error: string | null }> {
  try {
    if (await db.whatsappBillingOptout.findUnique({ where: { organizationId_waId: { organizationId: c.organizationId, waId: r.waId } }, select: { waId: true } })) return { status: "SKIPPED", error: "pediu para não receber mensagens" };
    if (!c.accountId) return { status: "FAILED", error: "campanha sem número" };
    const acc = await db.whatsappAccount.findFirst({ where: { id: c.accountId, organizationId: c.organizationId, enabled: true }, select: { id: true } });
    if (!acc) return { status: "FAILED", error: "número desconectado" };
    const found = await db.whatsappConversation.findUnique({ where: { accountId_waId: { accountId: acc.id, waId: r.waId } }, select: { id: true } });
    const conv = found ?? (await db.whatsappConversation.create({ data: { organizationId: c.organizationId, accountId: acc.id, waId: r.waId, clientId: r.clientId, status: "CLOSED" }, select: { id: true } }));
    const nome = r.name.split(" ")[0] ?? r.name;
    const res = (await windowAllowsText(c.organizationId, conv.id))
      ? await systemSendText(c.organizationId, conv.id, c.text.replace(/\{nome\}/g, nome))
      : c.templateId ? await systemSendTemplate(c.organizationId, conv.id, c.templateId, [nome, "-", "-", "-", "-"]) : null;
    if (!res) return { status: "SKIPPED", error: "fora da janela de 24 h e sem modelo" };
    return res.status === "SENT" ? { status: "SENT", error: null } : { status: "FAILED", error: (res.error ?? "o WhatsApp recusou o envio").slice(0, 300) };
  } catch (e) {
    if (e instanceof ConflictError || e instanceof ValidationError) return { status: "SKIPPED", error: e.message.slice(0, 300) };
    return { status: "FAILED", error: "falha ao enviar (conexão fora do ar?)" };
  }
}

export { providerKind };
