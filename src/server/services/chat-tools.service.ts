import { db } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { deleteObject, getObjectStream, putObject } from "@/lib/storage/local-storage";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { classifyFile } from "./document.service";
import { notify } from "./notification.service";
import { assertStorageAvailable } from "./plan.service";
import { LABEL_COLORS, saveLabel } from "./chat-meta.service";
import { sendFile, sendMessage } from "./whatsapp.service";
import { randomUUID } from "node:crypto";

/**
 * 4.0-F1/F2/F4 — ferramentas do Chat inspiradas no ChatGuru: etiquetas prontas, menção a colega, encaminhar a vários chats,
 * biblioteca de arquivos, checklists enviáveis, status de chat e arquivamento automático por inatividade.
 * Tudo que fala com o cliente é ação de uma pessoa (nunca sozinho), exceto o arquivamento, que só ENCERRA a conversa (não escreve ao cliente).
 */

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// ======================= F1: etiquetas prontas =======================

export const LABEL_PRESETS = {
  area: { label: "Por área do direito", names: ["Previdenciário", "Trabalhista", "Cível", "Família", "Consumidor", "Imobiliário", "Criminal", "Tributário", "Bancário"] },
  origem: { label: "Por origem do contato", names: ["Indicação", "Instagram", "Google", "Site", "Anúncio", "Já é cliente"] },
  responsavel: { label: "Por responsável (uma por membro da equipe)", names: [] as string[] },
} as const;
export type LabelPresetKey = keyof typeof LABEL_PRESETS;

export async function createLabelPreset(ctx: TenantContext, key: LabelPresetKey): Promise<{ created: string[]; skipped: string[] }> {
  assertCan(ctx, "whatsapp:manage");
  if (!(key in LABEL_PRESETS)) throw new ValidationError("Modelo de etiquetas inválido.");
  let names: string[] = [...LABEL_PRESETS[key].names];
  if (key === "responsavel") {
    const m = await db.membership.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE", user: { disabledAt: null }, role: { permissions: { has: "whatsapp:read" } } }, select: { user: { select: { name: true } } } });
    names = m.map((x) => `Resp.: ${x.user.name}`.slice(0, 60));
  }
  const have = new Set((await db.whatsappLabel.findMany({ where: { organizationId: ctx.organizationId }, select: { name: true } })).map((l) => norm(l.name)));
  const created: string[] = [];
  const skipped: string[] = [];
  let i = (await db.whatsappLabel.count({ where: { organizationId: ctx.organizationId } })) % LABEL_COLORS.length;
  for (const n of names) {
    if (have.has(norm(n))) { skipped.push(n); continue; }
    await saveLabel(ctx, null, { name: n, color: LABEL_COLORS[i++ % LABEL_COLORS.length]! });
    created.push(n);
  }
  return { created, skipped };
}

// ======================= F1: menção a colega =======================

/** Acha @menções (nome completo ou primeiro nome, sem acento/caixa). Só membros ativos com acesso ao Chat. */
export function findMentions(text: string, members: { id: string; name: string }[]): string[] {
  const t = norm(text);
  const out = new Set<string>();
  const sorted = [...members].sort((a, b) => b.name.length - a.name.length);
  for (const m of sorted) {
    const full = norm(m.name);
    const first = full.split(/\s+/)[0]!;
    for (const cand of [full, first]) {
      if (cand.length >= 2 && new RegExp(`(^|[^\\p{L}\\p{N}])@${cand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu").test(t)) { out.add(m.id); break; }
    }
  }
  return [...out];
}

export async function notifyMentions(ctx: TenantContext, conversationId: string, text: string): Promise<number> {
  if (!text.includes("@")) return 0;
  const rows = await db.membership.findMany({ where: { organizationId: ctx.organizationId, status: "ACTIVE", user: { disabledAt: null }, role: { permissions: { has: "whatsapp:read" } } }, select: { userId: true, user: { select: { name: true } } } });
  const ids = findMentions(text, rows.map((r) => ({ id: r.userId, name: r.user.name }))).filter((id) => id !== ctx.userId);
  if (!ids.length) return 0;
  const conv = await db.whatsappConversation.findFirst({ where: { id: conversationId, organizationId: ctx.organizationId }, select: { contactName: true, client: { select: { name: true } } } });
  const who = conv?.client?.name ?? conv?.contactName ?? "uma conversa";
  const me = rows.find((r) => r.userId === ctx.userId)?.user.name ?? "Um colega";
  return notify(ids.map((userId) => ({ organizationId: ctx.organizationId, userId, kind: "chat.mention", title: `${me} mencionou você`, body: `${who}: ${text.replace(/\s+/g, " ").slice(0, 160)}`, link: `/atendimento?c=${conversationId}`, dedupeKey: `chat.mention:${conversationId}:${userId}:${text.length}:${Math.floor(Date.now() / 60000)}` }))).catch(() => 0);
}

// ======================= F1: encaminhar a vários chats =======================

export const MAX_FORWARD = 10;
export type ForwardResult = { conversationId: string; ok: boolean; error: string | null };

async function readAll(key: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const r = (await getObjectStream(key)).getReader();
  for (;;) { const { done, value } = await r.read(); if (done) break; chunks.push(Buffer.from(value)); }
  return Buffer.concat(chunks);
}

export async function forwardMessage(ctx: TenantContext, messageId: string, targetIds: string[]): Promise<ForwardResult[]> {
  assertCan(ctx, "whatsapp:write");
  const ids = [...new Set(targetIds)];
  if (ids.length === 0) throw new ValidationError("Escolha ao menos uma conversa.", { targets: ["Escolha ao menos uma conversa."] });
  if (ids.length > MAX_FORWARD) throw new ValidationError(`Encaminhe para no máximo ${MAX_FORWARD} conversas de cada vez.`, { targets: [`No máximo ${MAX_FORWARD} conversas.`] });
  const m = await db.whatsappMessage.findFirst({ where: { id: messageId, organizationId: ctx.organizationId, direction: { in: ["IN", "OUT"] } }, select: { id: true, conversationId: true, body: true, mediaKey: true, mediaName: true } });
  if (!m) throw new NotFoundError("Mensagem não encontrada.");
  if (!m.body && !m.mediaKey) throw new ValidationError("Esta mensagem não tem conteúdo para encaminhar.");
  const valid = await db.whatsappConversation.findMany({ where: { id: { in: ids }, organizationId: ctx.organizationId }, select: { id: true } });
  const ok = new Set(valid.map((v) => v.id));
  const buf = m.mediaKey ? await readAll(m.mediaKey) : null;
  const out: ForwardResult[] = [];
  for (const id of ids) {
    if (!ok.has(id) || id === m.conversationId) { out.push({ conversationId: id, ok: false, error: id === m.conversationId ? "É a própria conversa." : "Conversa não encontrada." }); continue; }
    try {
      const r = buf ? await sendFile(ctx, id, { name: m.mediaName ?? "arquivo", buffer: buf }, m.body) : await sendMessage(ctx, id, m.body!);
      out.push({ conversationId: id, ok: r.status === "SENT", error: r.status === "SENT" ? null : r.error ?? "O WhatsApp recusou o envio." });
    } catch (e) {
      out.push({ conversationId: id, ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "Falha ao enviar." });
    }
  }
  await audit({ action: "whatsapp.forward", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_message", resourceId: messageId, metadata: { targets: ids.length, sent: out.filter((o) => o.ok).length }, meta: ctx.meta });
  return out;
}

// ======================= F2: biblioteca de arquivos =======================

export async function listLibrary(ctx: TenantContext, onlyActive = false) {
  assertCan(ctx, "whatsapp:read");
  return db.whatsappLibraryFile.findMany({ where: { organizationId: ctx.organizationId, ...(onlyActive ? { active: true } : {}) }, orderBy: { title: "asc" }, select: { id: true, title: true, fileName: true, mime: true, sizeBytes: true, active: true } });
}

export async function addLibraryFile(ctx: TenantContext, input: { title: string; file: { name: string; buffer: Buffer } }) {
  assertCan(ctx, "whatsapp:manage");
  const title = input.title.trim().replace(/\s+/g, " ");
  if (title.length < 2 || title.length > 80) throw new ValidationError("Dê um título de 2 a 80 caracteres.", { title: ["Dê um título de 2 a 80 caracteres."] });
  if ((await db.whatsappLibraryFile.count({ where: { organizationId: ctx.organizationId } })) >= 200) throw new ConflictError("A biblioteca já tem 200 arquivos.");
  const { name, mime } = classifyFile(input.file.name, input.file.buffer);
  await assertStorageAvailable(ctx.organizationId, input.file.buffer.length);
  const key = `${ctx.organizationId}/${randomUUID()}`;
  await putObject(key, input.file.buffer);
  try {
    const row = await db.whatsappLibraryFile.create({ data: { organizationId: ctx.organizationId, title, fileName: name, mime, sizeBytes: input.file.buffer.length, storageKey: key, createdById: ctx.userId }, select: { id: true } });
    await audit({ action: "whatsapp.library_add", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_library_file", resourceId: row.id, meta: ctx.meta });
    return row;
  } catch (e) {
    await deleteObject(key);
    throw e;
  }
}

export async function deleteLibraryFile(ctx: TenantContext, id: string) {
  assertCan(ctx, "whatsapp:manage");
  const f = await db.whatsappLibraryFile.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { storageKey: true } });
  if (!f) throw new NotFoundError("Arquivo não encontrado.");
  await db.whatsappLibraryFile.delete({ where: { id } });
  await deleteObject(f.storageKey).catch((e) => logger.warn("library.delete_object_failed", { error: String(e) }));
  await audit({ action: "whatsapp.library_delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_library_file", resourceId: id, meta: ctx.meta });
}

/** Uma pessoa escolhe o arquivo e a conversa: o envio passa por todas as regras do envio normal (janela de 24 h, tipos aceitos). */
export async function sendLibraryFile(ctx: TenantContext, conversationId: string, fileId: string) {
  assertCan(ctx, "whatsapp:write");
  const f = await db.whatsappLibraryFile.findFirst({ where: { id: fileId, organizationId: ctx.organizationId, active: true } });
  if (!f) throw new NotFoundError("Arquivo não encontrado.");
  return sendFile(ctx, conversationId, { name: f.fileName, buffer: await readAll(f.storageKey) }, f.title);
}

// ======================= F2: checklists =======================

export async function listChecklists(ctx: TenantContext, onlyActive = false) {
  assertCan(ctx, "whatsapp:read");
  return db.whatsappChecklist.findMany({ where: { organizationId: ctx.organizationId, ...(onlyActive ? { active: true } : {}) }, orderBy: { title: "asc" }, select: { id: true, title: true, items: true, active: true } });
}

export async function saveChecklist(ctx: TenantContext, id: string | null, input: { title: string; items: string[] }) {
  assertCan(ctx, "whatsapp:manage");
  const title = input.title.trim().replace(/\s+/g, " ");
  if (title.length < 2 || title.length > 80) throw new ValidationError("Dê um título de 2 a 80 caracteres.", { title: ["Dê um título de 2 a 80 caracteres."] });
  const items = input.items.map((x) => x.trim().replace(/\s+/g, " ")).filter(Boolean);
  if (items.length === 0 || items.length > 40) throw new ValidationError("Informe de 1 a 40 itens.", { items: ["Informe de 1 a 40 itens."] });
  if (items.some((x) => x.length > 200)) throw new ValidationError("Cada item pode ter até 200 caracteres.", { items: ["Item longo demais (máximo 200)."] });
  if (id) {
    const r = await db.whatsappChecklist.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { title, items } });
    if (r.count !== 1) throw new NotFoundError("Checklist não encontrado.");
    return { id };
  }
  const row = await db.whatsappChecklist.create({ data: { organizationId: ctx.organizationId, title, items, createdById: ctx.userId }, select: { id: true } });
  await audit({ action: "whatsapp.checklist_create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "whatsapp_checklist", resourceId: row.id, meta: ctx.meta });
  return row;
}

export async function deleteChecklist(ctx: TenantContext, id: string) {
  assertCan(ctx, "whatsapp:manage");
  const r = await db.whatsappChecklist.deleteMany({ where: { id, organizationId: ctx.organizationId } });
  if (r.count !== 1) throw new NotFoundError("Checklist não encontrado.");
}

export const checklistText = (title: string, items: string[]) => `*${title}*\n${items.map((x) => `☐ ${x}`).join("\n")}`;

export async function sendChecklist(ctx: TenantContext, conversationId: string, checklistId: string) {
  assertCan(ctx, "whatsapp:write");
  const c = await db.whatsappChecklist.findFirst({ where: { id: checklistId, organizationId: ctx.organizationId, active: true } });
  if (!c) throw new NotFoundError("Checklist não encontrado.");
  return sendMessage(ctx, conversationId, checklistText(c.title, c.items));
}

// ======================= F4: status de chat e arquivamento =======================

export async function listChatStatuses(ctx: TenantContext) {
  assertCan(ctx, "whatsapp:read");
  return db.whatsappChatStatus.findMany({ where: { organizationId: ctx.organizationId }, orderBy: [{ position: "asc" }, { name: "asc" }], select: { id: true, name: true, color: true, position: true } });
}

export async function saveChatStatus(ctx: TenantContext, id: string | null, input: { name: string; color: string }) {
  assertCan(ctx, "whatsapp:manage");
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 40) throw new ValidationError("Dê um nome de 2 a 40 caracteres.", { name: ["Dê um nome de 2 a 40 caracteres."] });
  if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) throw new ValidationError("Cor inválida.", { color: ["Escolha uma cor da lista."] });
  const dup = await db.whatsappChatStatus.findFirst({ where: { organizationId: ctx.organizationId, name: { equals: name, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
  if (dup) throw new ValidationError("Já existe um status com esse nome.", { name: ["Já existe um status com esse nome."] });
  if (id) {
    const r = await db.whatsappChatStatus.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { name, color: input.color } });
    if (r.count !== 1) throw new NotFoundError("Status não encontrado.");
    return { id };
  }
  const count = await db.whatsappChatStatus.count({ where: { organizationId: ctx.organizationId } });
  if (count >= 20) throw new ConflictError("O limite é de 20 status.");
  return db.whatsappChatStatus.create({ data: { organizationId: ctx.organizationId, name, color: input.color, position: count }, select: { id: true } });
}

export async function deleteChatStatus(ctx: TenantContext, id: string) {
  assertCan(ctx, "whatsapp:manage");
  const r = await db.whatsappChatStatus.deleteMany({ where: { id, organizationId: ctx.organizationId } });
  if (r.count !== 1) throw new NotFoundError("Status não encontrado.");
}

export async function setChatStatus(ctx: TenantContext, conversationId: string, statusId: string | null) {
  assertCan(ctx, "whatsapp:write");
  if (statusId) {
    const s = await db.whatsappChatStatus.findFirst({ where: { id: statusId, organizationId: ctx.organizationId }, select: { id: true } });
    if (!s) throw new NotFoundError("Status não encontrado.");
  }
  const r = await db.whatsappConversation.updateMany({ where: { id: conversationId, organizationId: ctx.organizationId }, data: { chatStatusId: statusId } });
  if (r.count !== 1) throw new NotFoundError("Conversa não encontrada.");
}

/**
 * Encerra (não escreve ao cliente) as conversas ABERTAS sem nenhuma mensagem há X dias, nas organizações que ligaram a chave.
 * Roda no máximo uma vez por hora por escritório. Conversas com retorno combinado em aberto não são encerradas.
 */
export async function runAutoArchive(now = new Date()): Promise<{ orgs: number; closed: number }> {
  const orgs = await db.whatsappExtrasSettings.findMany({ where: { archiveEnabled: true, OR: [{ archiveLastRunAt: null }, { archiveLastRunAt: { lt: new Date(now.getTime() - 55 * 60_000) } }] }, select: { organizationId: true, archiveDays: true } });
  let closed = 0;
  for (const o of orgs) {
    const claimed = await db.whatsappExtrasSettings.updateMany({ where: { organizationId: o.organizationId, OR: [{ archiveLastRunAt: null }, { archiveLastRunAt: { lt: new Date(now.getTime() - 55 * 60_000) } }] }, data: { archiveLastRunAt: now } });
    if (claimed.count !== 1) continue;
    const cutoff = new Date(now.getTime() - o.archiveDays * 86_400_000);
    const stale = await db.whatsappConversation.findMany({ where: { organizationId: o.organizationId, status: "OPEN", OR: [{ lastMessageAt: { lt: cutoff } }, { lastMessageAt: null, createdAt: { lt: cutoff } }], followUps: { none: { doneAt: null } } }, select: { id: true }, take: 500 });
    for (const c of stale) {
      const r = await db.whatsappConversation.updateMany({ where: { id: c.id, status: "OPEN" }, data: { status: "CLOSED" } });
      if (r.count !== 1) continue;
      closed++;
      await db.whatsappMessage.create({ data: { organizationId: o.organizationId, conversationId: c.id, direction: "NOTE", type: "text", body: `Encerrada automaticamente por inatividade (${o.archiveDays} dia(s) sem mensagens).`, status: "NOTE" } });
    }
    if (stale.length) await audit({ action: "whatsapp.auto_archive", organizationId: o.organizationId, userId: null, resourceType: "whatsapp_conversation", metadata: { closed: stale.length, days: o.archiveDays } });
  }
  return { orgs: orgs.length, closed };
}
