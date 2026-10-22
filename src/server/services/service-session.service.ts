import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/client";
import { getTranscriber } from "@/lib/ai/gemini";
import { AiProviderError } from "@/lib/ai/provider";
import { maskSensitive } from "@/lib/ai/mask";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { aiRun, gate, SAFETY, stripUnverifiedCitations } from "./ai-tools.service";
import { assertCredits, chargeCredits } from "./credit.service";
import { assertModule } from "./org-security.service";
import { getCase } from "./case.service";
import { createTask } from "./task.service";

/**
 * 5.0-F5 — Copiloto de atendimento. A pessoa cola a transcrição (ou envia o áudio, que o Gemini transcreve) e a IA devolve
 * resumo, ações que podem caber, tarefas e documentos sugeridos — tudo em RASCUNHO. Nada vira tarefa sem uma pessoa marcar e aprovar.
 * Nada é enviado ao cliente. Só a IA vê o texto (com dados sensíveis mascarados); ela não conhece fatos fora da transcrição.
 */

export const MAX_TRANSCRIPT = 40_000;
export const MAX_AUDIO = 10 * 1024 * 1024;
const AUDIO_OK = ["audio/ogg", "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/aac", "audio/flac", "audio/aiff", "audio/mp4", "audio/webm"];

export type SuggestedAction = { title: string; basis: string };
export type SuggestedTask = { title: string; description: string; priority: "LOW" | "NORMAL" | "HIGH" | "URGENT"; created?: string | null };
export type SuggestedDoc = { name: string; why: string };
export type SessionAnalysis = { summary: string; actions: SuggestedAction[]; tasks: SuggestedTask[]; documents: SuggestedDoc[] };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const PRIO = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

/** Lê o JSON devolvido pelo modelo de forma defensiva (aceita cercas ```json e texto em volta). */
export function parseAnalysis(raw: string): SessionAnalysis {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new ConflictError("A IA não devolveu um resultado legível. Tente de novo.");
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    throw new ConflictError("A IA não devolveu um resultado legível. Tente de novo.");
  }
  const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : []);
  const clean = (s: string) => stripUnverifiedCitations(s).text;
  return {
    summary: clean(str(j.summary, 4000)),
    actions: arr(j.actions).slice(0, 8).map((a) => ({ title: clean(str(a.title, 200)), basis: clean(str(a.basis, 600)) })).filter((a) => a.title),
    tasks: arr(j.tasks).slice(0, 12).map((t) => ({ title: clean(str(t.title, 200)), description: clean(str(t.description, 800)), priority: (PRIO as readonly string[]).includes(str(t.priority, 10)) ? (str(t.priority, 10) as SuggestedTask["priority"]) : "NORMAL" })).filter((t) => t.title.length >= 3),
    documents: arr(j.documents).slice(0, 10).map((d) => ({ name: clean(str(d.name, 160)), why: clean(str(d.why, 300)) })).filter((d) => d.name),
  };
}

export async function createSession(ctx: TenantContext, input: { title: string; transcript: string; clientId?: string | null; caseId?: string | null }) {
  assertCan(ctx, "ai:use");
  const title = input.title.trim();
  if (title.length < 3) throw new ValidationError("Dê um título ao atendimento.", { title: ["Dê um título ao atendimento."] });
  const transcript = input.transcript.trim();
  if (transcript.length < 80) throw new ValidationError("A transcrição está curta demais (mínimo 80 caracteres).", { transcript: ["Mínimo de 80 caracteres."] });
  if (transcript.length > MAX_TRANSCRIPT) throw new ValidationError(`A transcrição pode ter no máximo ${MAX_TRANSCRIPT.toLocaleString("pt-BR")} caracteres.`, { transcript: ["Texto grande demais."] });
  if (input.clientId) {
    assertCan(ctx, "clients:read");
    if (!(await db.client.findFirst({ where: { id: input.clientId, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true } }))) throw new NotFoundError("Cliente não encontrado.");
  }
  if (input.caseId) {
    assertCan(ctx, "cases:read");
    await getCase(ctx, input.caseId);
  }
  const s = await db.serviceSession.create({ data: { organizationId: ctx.organizationId, clientId: input.clientId || null, caseId: input.caseId || null, title: title.slice(0, 160), transcript, createdById: ctx.userId }, select: { id: true } });
  await audit({ action: "copilot.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "service_session", resourceId: s.id, meta: ctx.meta });
  return s;
}

async function mine(ctx: TenantContext, id: string) {
  assertCan(ctx, "ai:use");
  const s = await db.serviceSession.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!s) throw new NotFoundError("Atendimento não encontrado.");
  return s;
}

export async function analyzeSession(ctx: TenantContext, id: string) {
  const s = await mine(ctx, id);
  if (s.status === "REVIEWED") throw new ConflictError("Este atendimento já foi revisado.");
  const system = `Você é o copiloto de um advogado brasileiro DEPOIS de um atendimento. Você recebe a transcrição e organiza o trabalho seguinte.\n${SAFETY}\nResponda SOMENTE com um JSON válido, sem texto fora dele, neste formato:\n{"summary":"resumo em até 150 palavras","actions":[{"title":"ação ou ação judicial que PODE caber","basis":"o que no relato sustenta isso e o que ainda precisa ser confirmado"}],"tasks":[{"title":"tarefa objetiva","description":"detalhe","priority":"LOW|NORMAL|HIGH|URGENT"}],"documents":[{"name":"documento a pedir ao cliente ou a produzir","why":"para quê"}]}\nRegras: só sugira ações compatíveis com o relato; diga "a confirmar" quando faltar dado; não cite número de processo, súmula ou tema como se fossem reais; não prometa resultado.`;
  const c = await aiRun(ctx, "service_copilot", s.caseId, system, `<transcricao>\n${maskSensitive(s.transcript)}\n</transcricao>`, 2500);
  const a = parseAnalysis(c.text);
  if (!a.summary) throw new ConflictError("A IA não devolveu um resumo. Tente de novo.");
  await db.serviceSession.update({ where: { id }, data: { summary: a.summary, actions: a.actions, tasks: a.tasks, documents: a.documents, tokens: c.inputTokens + c.outputTokens, status: "ANALYZED" } });
  await audit({ action: "copilot.analyze", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "service_session", resourceId: id, meta: ctx.meta });
  return a;
}

export async function listSessions(ctx: TenantContext) {
  assertCan(ctx, "ai:use");
  return db.serviceSession.findMany({ where: { organizationId: ctx.organizationId, createdById: ctx.userId }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, title: true, status: true, createdAt: true } });
}

export async function getSession(ctx: TenantContext, id: string) {
  const s = await mine(ctx, id);
  if (s.createdById !== ctx.userId && !ctx.isOwner) throw new NotFoundError("Atendimento não encontrado.");
  return { ...s, actions: s.actions as SuggestedAction[], tasks: s.tasks as SuggestedTask[], documents: s.documents as SuggestedDoc[] };
}

/** Revisão humana: cria SOMENTE as tarefas marcadas (índices), com o responsável escolhido. Encerra o atendimento. */
export async function approveSession(ctx: TenantContext, id: string, input: { taskIndexes: number[]; assigneeId?: string | null; summary?: string }) {
  assertCan(ctx, "ai:use");
  const s = await getSession(ctx, id);
  if (s.status !== "ANALYZED") throw new ConflictError(s.status === "REVIEWED" ? "Este atendimento já foi revisado." : "Gere a análise antes de revisar.");
  const picks = [...new Set(input.taskIndexes)].filter((i) => Number.isInteger(i) && i >= 0 && i < s.tasks.length);
  if (picks.length) assertCan(ctx, "tasks:write");
  const tasks = s.tasks.map((t) => ({ ...t }));
  for (const i of picks) {
    const t = tasks[i]!;
    const created = await createTask(ctx, { title: t.title, description: `${t.description}\n\n(Sugerida pelo copiloto de atendimento: ${s.title}. Revisada por uma pessoa.)`.trim(), status: "TODO", priority: t.priority, dueDate: "", assigneeId: input.assigneeId ?? "", caseId: s.caseId ?? "", clientId: s.clientId ?? "" });
    t.created = created.id;
  }
  await db.serviceSession.update({ where: { id }, data: { tasks, summary: input.summary?.trim() ? input.summary.trim().slice(0, 4000) : s.summary, status: "REVIEWED", reviewedAt: new Date() } });
  await audit({ action: "copilot.review", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "service_session", resourceId: id, metadata: { tasks: picks.length }, meta: ctx.meta });
  return { created: picks.length };
}

export async function deleteSession(ctx: TenantContext, id: string) {
  const s = await getSession(ctx, id);
  await db.serviceSession.delete({ where: { id: s.id } });
  await audit({ action: "copilot.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "service_session", resourceId: id, meta: ctx.meta });
}

/** Áudio → texto (Gemini). Exige chave, IA ligada, módulo e créditos (se o escritório usa). O áudio não é guardado; só o texto vai para o formulário. */
export async function transcribeAudio(ctx: TenantContext, file: { mime: string; data: Buffer }): Promise<{ text: string }> {
  assertCan(ctx, "ai:use");
  const mime = file.mime.split(";")[0]!.trim().toLowerCase();
  if (!AUDIO_OK.includes(mime)) throw new ValidationError("Formato de áudio não suportado para transcrição.");
  if (file.data.length === 0 || file.data.length > MAX_AUDIO) throw new ValidationError("O áudio deve ter até 10 MB.");
  await assertModule(ctx.organizationId, "ia");
  const org = await db.organization.findUnique({ where: { id: ctx.organizationId }, select: { aiEnabled: true } });
  if (!org?.aiEnabled) throw new ConflictError("A IA está desligada neste escritório (o áudio é enviado ao Google).");
  const t = getTranscriber();
  if (!t) throw new ConflictError("A transcrição não está configurada neste sistema (falta a chave do Gemini).");
  await assertCredits(ctx.organizationId, "audio.transcribe");
  let r;
  try {
    r = await t.transcribe({ mime, data: file.data });
  } catch (e) {
    if (e instanceof AiProviderError) throw new ConflictError(e.message);
    throw e;
  }
  const ref = randomUUID();
  await db.aiUsage.create({ data: { organizationId: ctx.organizationId, userId: ctx.userId, feature: "audio_transcribe", provider: t.name, model: t.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens } });
  await chargeCredits(ctx.organizationId, "audio.transcribe", { type: "service_session_audio", id: ref, userId: ctx.userId });
  await audit({ action: "copilot.transcribe", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "organization", resourceId: ctx.organizationId, meta: ctx.meta });
  return { text: r.text };
}

export async function copilotAvailability(ctx: TenantContext) {
  try {
    await gate(ctx);
    return { ok: true as const, reason: null };
  } catch (e) {
    return { ok: false as const, reason: e instanceof Error ? e.message : "Indisponível." };
  }
}
