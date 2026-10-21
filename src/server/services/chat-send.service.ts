import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { normalizeWaId } from "@/lib/whatsapp/phone";
import { sendTextSchema } from "@/modules/whatsapp/send-schema";
import { assertCan, can, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { getCase } from "./case.service";
import { sendMessage, startConversation } from "./whatsapp.service";

/**
 * 2.0-F6: "Enviar por WhatsApp" no processo, na ficha do cliente e nos aniversários.
 * NADA sai sozinho: o sistema só sugere um texto; uma pessoa lê, edita e clica em enviar. A mensagem sai pelo número do
 * escritório (LegalOS Chat), fica na conversa do cliente e vale a regra da janela de 24 horas da API oficial.
 * A auditoria guarda quem enviou, para quem e de onde (nunca o texto).
 */

export type ClientMessageTarget = {
  clientId: string;
  name: string;
  /** Preenchido quando o envio não é possível, com o motivo em português. */
  blockedReason: string | null;
  suggested: string;
};

const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? n;

async function availability(ctx: TenantContext, phone: string | null): Promise<string | null> {
  if (!can(ctx, "whatsapp:write")) return "Seu perfil não permite enviar mensagens pelo WhatsApp.";
  if (!phone || !normalizeWaId(phone)) return "O cliente não tem telefone válido no cadastro.";
  const acc = await db.whatsappAccount.findUnique({ where: { organizationId: ctx.organizationId }, select: { enabled: true } });
  if (!acc?.enabled) return "O WhatsApp não está conectado/ligado neste escritório.";
  return null;
}

export function birthdayText(clientName: string, orgName: string): string {
  return `Olá, ${firstName(clientName)}! A equipe do ${orgName} deseja a você um feliz aniversário, com muita saúde e alegria. Um abraço!`;
}

export function caseText(clientName: string, orgName: string, caseLabel: string, lastEvent: { title: string; date: string } | null): string {
  const last = lastEvent ? ` A última movimentação foi em ${lastEvent.date}: ${lastEvent.title}.` : "";
  return `Olá, ${firstName(clientName)}! Aqui é da equipe do ${orgName}. Passando para falar sobre o seu processo ${caseLabel}.${last} Qualquer dúvida, é só responder esta mensagem.`;
}

/** Clientes do processo que podem receber mensagem, cada um com o texto sugerido. Respeita a visibilidade do processo. */
export async function caseMessageTargets(ctx: TenantContext, caseId: string, orgName: string): Promise<ClientMessageTarget[]> {
  if (!can(ctx, "whatsapp:write") || !can(ctx, "clients:read")) return [];
  const c = await getCase(ctx, caseId);
  const ids = [...new Set(c.parties.filter((p) => p.isOurClient && p.clientId).map((p) => p.clientId!))];
  if (!ids.length) return [];
  const clients = await db.client.findMany({ where: { id: { in: ids }, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true, name: true, phone: true } });
  const last = await db.caseEvent.findFirst({ where: { caseId, organizationId: ctx.organizationId }, orderBy: { occurredAt: "desc" }, select: { title: true, occurredAt: true } });
  const label = c.number ?? c.legacyNumber ?? c.title;
  const lastEvent = last ? { title: last.title, date: new Intl.DateTimeFormat("pt-BR", { timeZone: ctx.timezone, dateStyle: "short" }).format(last.occurredAt) } : null;
  const out: ClientMessageTarget[] = [];
  for (const cl of clients) out.push({ clientId: cl.id, name: cl.name, blockedReason: await availability(ctx, cl.phone), suggested: caseText(cl.name, orgName, label, lastEvent) });
  return out;
}

export async function clientMessageTarget(ctx: TenantContext, clientId: string, orgName: string, kind: "birthday" | "generic" = "generic"): Promise<ClientMessageTarget | null> {
  if (!can(ctx, "whatsapp:write") || !can(ctx, "clients:read")) return null;
  const cl = await db.client.findFirst({ where: { id: clientId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true, name: true, phone: true } });
  if (!cl) return null;
  return { clientId: cl.id, name: cl.name, blockedReason: await availability(ctx, cl.phone), suggested: kind === "birthday" ? birthdayText(cl.name, orgName) : `Olá, ${firstName(cl.name)}! Aqui é da equipe do ${orgName}. ` };
}

export type SendSource = "case" | "client" | "birthday";

export async function sendToClient(ctx: TenantContext, raw: unknown, source: SendSource = "client") {
  assertCan(ctx, "whatsapp:write");
  assertCan(ctx, "clients:read");
  const p = sendTextSchema.safeParse(raw);
  if (!p.success) throw new ValidationError("Corrija a mensagem.", { text: [p.error.issues[0]?.message ?? "Mensagem inválida."] });
  const cl = await db.client.findFirst({ where: { id: p.data.clientId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true, phone: true } });
  if (!cl) throw new NotFoundError("Cliente não encontrado.");
  if (p.data.caseId) await getCase(ctx, p.data.caseId); // confere visibilidade do processo
  const why = await availability(ctx, cl.phone);
  if (why) throw new ConflictError(why);
  const conv = await startConversation(ctx, { phone: cl.phone!, clientId: cl.id });
  if (p.data.caseId) await db.whatsappConversation.updateMany({ where: { id: conv.id, organizationId: ctx.organizationId, caseId: null }, data: { caseId: p.data.caseId } }).catch(() => undefined);
  const r = await sendMessage(ctx, conv.id, p.data.text);
  await audit({ action: "whatsapp.send_to_client", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "client", resourceId: cl.id, metadata: { source, status: r.status, caseId: p.data.caseId ?? null }, meta: ctx.meta });
  return { conversationId: conv.id, status: r.status, error: r.error };
}
