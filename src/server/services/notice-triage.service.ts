import { db } from "@/lib/db/client";
import { maskSensitive } from "@/lib/ai/mask";
import { calculateDeadline } from "@/lib/deadlines/calculator";
import { dayStatus } from "@/lib/deadlines/calculator";
import { addDays, formatYmd, todayYmd, ymdToDate } from "@/lib/dates/ymd";
import { guessTriage, skeletonMinuta } from "@/lib/notices/triage-rules";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { assertCan, can, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { aiRun, DRAFT_BANNER, gate, SAFETY, stripUnverifiedCitations } from "./ai-tools.service";
import { buildCaseContext } from "./ai.service";
import { createDeadline } from "./deadline.service";
import { getNotice } from "./notice.service";

/**
 * 5.0-F4 — triagem de publicação: o que exige (regras), prazo calculado (calculadora auxiliar) e minuta em rascunho
 * (modelo sem IA, ou IA se a pessoa pedir). NADA é protocolado nem vira prazo definitivo: a pessoa valida.
 */
const m2 = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Ciência presumida pelo DJe: primeiro dia útil seguinte à publicação (CPC, art. 224, §2º). A contagem começa no dia útil seguinte (calculateDeadline). */
export function presumedAwareness(published: string): string {
  let d = addDays(published, 1);
  for (let i = 0; i < 15 && !dayStatus(d, { applyRecess: false }).business; i++) d = addDays(d, 1);
  return d;
}

export async function triageNotice(ctx: TenantContext, noticeId: string, opts: { useAi?: boolean } = {}) {
  assertCan(ctx, "inbox:write");
  const n = await getNotice(ctx, noticeId);
  if (n.status === "PROCESSED" || n.status === "DISCARDED") throw new ValidationError("Esta publicação já foi encerrada.");
  const existing = await db.noticeTriage.findUnique({ where: { noticeId } });
  if (existing && existing.status !== "DRAFT") throw new ConflictError("Esta triagem já foi validada ou descartada.");

  const g = guessTriage(`${n.title}\n${n.content}`, { court: n.court });
  const base = (n.publishedAt ?? n.receivedAt).toISOString().slice(0, 10);
  const aware = presumedAwareness(base);
  let dueDate: string | null = null;
  let calcNote: string | null = null;
  if (g.days && g.countType) {
    const r = calculateDeadline({ startDate: aware, days: g.days, countType: g.countType });
    dueDate = r.dueDate;
    calcNote = `Publicação em ${formatYmd(base)}; ciência presumida em ${formatYmd(aware)} (DJe, art. 224, §2º CPC). ${r.note}${g.fromText ? "\nO número de dias veio do texto da publicação." : g.act ? `\nPrazo da tabela do ato (${g.act.basis}).` : ""}`;
  }

  let minuta = skeletonMinuta({ actLabel: g.act?.label ?? null, caseNumber: n.caseNumber, court: n.court });
  let source = "RULES";
  let aiUsed = false;
  if (opts.useAi) {
    await gate(ctx);
    assertCan(ctx, "cases:read");
    const ctxText = n.caseId ? (await buildCaseContext(ctx, n.caseId)).context : "";
    const system = `Você redige MINUTAS de manifestação para advogados brasileiros revisarem, em resposta a uma publicação do processo.\n${SAFETY}\nRegras específicas:\n- Use somente o texto da <publicacao> e o <contexto>. Onde faltar dado, escreva [PREENCHER: o que falta].\n- Não cite jurisprudência com número, relator ou data. Se precisar, escreva [PESQUISAR JURISPRUDÊNCIA SOBRE: tema].\n- Estrutura: endereçamento, qualificação ([PREENCHER] se faltar), fatos, direito, pedidos. Sem assinatura. Ato provável: ${g.act?.label ?? "a definir pelo advogado"}.`;
    const c = await aiRun(ctx, "notice_triage", n.caseId ?? null, system, `<publicacao>\n${maskSensitive(n.content).slice(0, 10_000)}\n</publicacao>\n\n<contexto>\n${ctxText}\n</contexto>`, 3000);
    minuta = `${DRAFT_BANNER}\n\n${stripUnverifiedCitations(c.text).text}`;
    source = "AI";
    aiUsed = true;
  }

  const data = { summary: g.summary, requirement: g.requirement, actKey: g.act?.key ?? null, days: g.days, countType: g.countType, dueDate: dueDate ? ymdToDate(dueDate) : null, minuta, source };
  const row = existing
    ? await db.noticeTriage.update({ where: { noticeId }, data, select: { id: true } })
    : await db.noticeTriage.create({ data: { ...data, organizationId: ctx.organizationId, noticeId, createdById: ctx.userId }, select: { id: true } });
  await audit({ action: "notice.triage", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: noticeId, metadata: { ai: aiUsed, act: g.act?.key ?? null }, meta: ctx.meta });
  return { id: row.id, calcNote };
}

export async function getTriage(ctx: TenantContext, noticeId: string) {
  assertCan(ctx, "inbox:read");
  await getNotice(ctx, noticeId);
  const t = await db.noticeTriage.findFirst({ where: { noticeId, organizationId: ctx.organizationId } });
  return t ? { ...t, dueDate: m2(t.dueDate) } : null;
}

export async function updateTriageMinuta(ctx: TenantContext, noticeId: string, minuta: string) {
  assertCan(ctx, "inbox:write");
  const t = await getTriage(ctx, noticeId);
  if (!t) throw new NotFoundError("Triagem não encontrada.");
  if (t.status !== "DRAFT") throw new ConflictError("A triagem já foi encerrada.");
  await db.noticeTriage.update({ where: { id: t.id }, data: { minuta: minuta.slice(0, 30_000) } });
}

/** Validação humana. Opcionalmente cria o prazo (que também nasce como RASCUNHO, a validar na tela de prazos). */
export async function validateTriage(ctx: TenantContext, noticeId: string, opts: { createDeadline: boolean }) {
  assertCan(ctx, "inbox:write");
  const t = await getTriage(ctx, noticeId);
  if (!t) throw new NotFoundError("Triagem não encontrada.");
  if (t.status !== "DRAFT") throw new ConflictError("A triagem já foi encerrada.");
  const n = await getNotice(ctx, noticeId);
  let deadlineId: string | null = null;
  if (opts.createDeadline) {
    assertCan(ctx, "deadlines:write");
    if (!n.caseId) throw new ValidationError("Vincule a publicação a um processo antes de criar o prazo.");
    if (!t.dueDate || !t.days || !t.countType) throw new ValidationError("A triagem não tem prazo calculado.");
    const base = (n.publishedAt ?? n.receivedAt).toISOString().slice(0, 10);
    const label = t.actKey ? (await import("@/lib/calc/prazos")).ACTS.find((a) => a.key === t.actKey)?.label ?? "Prazo" : "Prazo";
    const d = await createDeadline(ctx, { caseId: n.caseId, title: `${label} — ${n.title}`.slice(0, 200), kind: label.slice(0, 80), startDate: presumedAwareness(base), days: String(t.days), countType: t.countType as "BUSINESS" | "CALENDAR", dueDate: t.dueDate, internalDueDate: "", responsibleId: "", notes: `Criado pela triagem da publicação. ${t.requirement}`, calculationNote: "Calculado pela triagem (auxiliar). Conferir antes de validar." }, { sourceNoticeId: noticeId });
    deadlineId = d.id;
  }
  await db.noticeTriage.update({ where: { id: t.id }, data: { status: "VALIDATED", validatedById: ctx.userId, validatedAt: new Date(), deadlineId } });
  await audit({ action: "notice.triage_validate", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: noticeId, metadata: { deadlineId }, meta: ctx.meta });
  return { deadlineId };
}

export async function discardTriage(ctx: TenantContext, noticeId: string) {
  assertCan(ctx, "inbox:write");
  const t = await getTriage(ctx, noticeId);
  if (!t) throw new NotFoundError("Triagem não encontrada.");
  await db.noticeTriage.update({ where: { id: t.id }, data: { status: "DISCARDED" } });
  await audit({ action: "notice.triage_discard", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", resourceId: noticeId, meta: ctx.meta });
}

export function triageAvailability(ctx: TenantContext) {
  return { canAi: can(ctx, "ai:use") };
}
void todayYmd;
