import { db } from "@/lib/db/client";
import { addDays, todayYmd, ymdToDate, dateToYmd } from "@/lib/dates/ymd";
import { DjenError, fetchDjen, type DjenHttp, type DjenItem, defaultHttp } from "@/lib/djen/client";
import { UFS } from "@/lib/mni/tribunals";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { formatCnj, isValidCnj, onlyDigits } from "@/lib/validation/br-documents";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { requireMfa } from "./certificate.service";
import { isUniqueViolation } from "./db-errors";
import { assignNoticeToTeam } from "./inbox-flow.service";
import { assignNotice, createNotice } from "./notice.service";
import { resolveTenantContext } from "./tenant.service";

export type MonitorRow = { id: string; label: string; oabNumber: string; oabUf: string; enabled: boolean; lastSyncAt: Date | null; lastStatus: string | null; lastMessage: string | null; defaultAssigneeId: string | null; defaultTeamId: string | null };

const OVERLAP_DAYS = 2;
const FIRST_SYNC_DAYS = 7;
const MAX_DAYS = 30;

export async function listMonitors(ctx: TenantContext): Promise<MonitorRow[]> {
  assertCan(ctx, "integrations:manage");
  return db.djenMonitor.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "asc" }, select: { id: true, label: true, oabNumber: true, oabUf: true, enabled: true, lastSyncAt: true, lastStatus: true, lastMessage: true, defaultAssigneeId: true, defaultTeamId: true } });
}

export async function createMonitor(ctx: TenantContext, input: { label: string; oabNumber: string; oabUf: string }) {
  assertCan(ctx, "integrations:manage");
  const label = input.label.trim();
  if (label.length < 2 || label.length > 80) throw new ValidationError("Dê um nome ao monitoramento (2 a 80 caracteres).", { label: ["Nome inválido."] });
  const oabNumber = onlyDigits(input.oabNumber).replace(/^0+/, "");
  if (!/^[0-9]{1,7}$/.test(oabNumber)) throw new ValidationError("Informe o número da OAB (somente dígitos, até 7).", { oabNumber: ["Número inválido."] });
  const oabUf = input.oabUf.trim().toUpperCase();
  if (!UFS.includes(oabUf)) throw new ValidationError("Selecione a seccional (UF) da OAB.", { oabUf: ["UF inválida."] });
  try {
    const m = await db.djenMonitor.create({ data: { organizationId: ctx.organizationId, label, oabNumber, oabUf, createdById: ctx.userId }, select: { id: true } });
    await audit({ action: "djen.monitor_create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "djen_monitor", resourceId: m.id, metadata: { oabUf }, meta: ctx.meta });
    return m;
  } catch (e) {
    if (isUniqueViolation(e)) throw new ValidationError("Essa OAB já está sendo monitorada.", { oabNumber: ["Essa OAB já está sendo monitorada."] });
    throw e;
  }
}

/** Define quem recebe as publicações novas deste monitoramento: um membro, uma equipe, ou ninguém (vão para a Entrada). */
export async function setMonitorRecipients(ctx: TenantContext, id: string, input: { userId?: string | null; teamId?: string | null }) {
  assertCan(ctx, "integrations:manage");
  const userId = input.userId || null;
  const teamId = input.teamId || null;
  if (userId && teamId) throw new ValidationError("Escolha um membro OU uma equipe, não os dois.", { userId: ["Escolha um membro ou uma equipe."] });
  if (userId) {
    const ok = await db.membership.findFirst({ where: { organizationId: ctx.organizationId, userId, status: "ACTIVE", role: { permissions: { has: "inbox:read" } } }, select: { userId: true } });
    if (!ok) throw new ValidationError("Este membro não está ativo ou não tem acesso à caixa de entrada.", { userId: ["Escolha um membro com acesso à caixa de entrada."] });
  }
  if (teamId) {
    const ok = await db.workTeam.findFirst({ where: { id: teamId, organizationId: ctx.organizationId }, select: { id: true } });
    if (!ok) throw new ValidationError("Equipe inválida.", { teamId: ["Selecione uma equipe."] });
  }
  const r = await db.djenMonitor.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { defaultAssigneeId: userId, defaultTeamId: teamId } });
  if (r.count !== 1) throw new NotFoundError("Monitoramento não encontrado.");
  await audit({ action: "djen.monitor_recipients", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "djen_monitor", resourceId: id, metadata: { userId, teamId }, meta: ctx.meta });
}

export async function setMonitorEnabled(ctx: TenantContext, id: string, enabled: boolean) {
  assertCan(ctx, "integrations:manage");
  const r = await db.djenMonitor.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { enabled } });
  if (r.count !== 1) throw new NotFoundError("Monitoramento não encontrado.");
  await audit({ action: enabled ? "djen.monitor_enable" : "djen.monitor_disable", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "djen_monitor", resourceId: id, meta: ctx.meta });
}

export async function deleteMonitor(ctx: TenantContext, id: string) {
  assertCan(ctx, "integrations:manage");
  await requireMfa(ctx.userId);
  const r = await db.djenMonitor.deleteMany({ where: { id, organizationId: ctx.organizationId } });
  if (r.count !== 1) throw new NotFoundError("Monitoramento não encontrado.");
  await audit({ action: "djen.monitor_delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "djen_monitor", resourceId: id, meta: ctx.meta });
}

function kindOf(it: DjenItem): "INTIMACAO" | "CITACAO" | "DESPACHO" | "DECISAO" | "SENTENCA" | "OUTRO" {
  const s = `${it.tipoDocumento ?? ""} ${it.tipoComunicacao ?? ""}`.toLowerCase();
  if (s.includes("senten")) return "SENTENCA";
  if (s.includes("decis") || s.includes("acórd") || s.includes("acord")) return "DECISAO";
  if (s.includes("despacho")) return "DESPACHO";
  if (s.includes("cita")) return "CITACAO";
  if (s.includes("intima")) return "INTIMACAO";
  return "OUTRO";
}
const KIND_LABEL = { INTIMACAO: "Intimação", CITACAO: "Citação", DESPACHO: "Despacho", DECISAO: "Decisão", SENTENCA: "Sentença", OUTRO: "Comunicação" } as const;

function cnjOf(digits: string | null): string | null {
  if (!digits || digits.length !== 20) return null;
  const f = formatCnj(digits);
  return isValidCnj(f) ? f : null;
}

export type DjenSyncResult = { found: number; imported: number; alreadyKnown: number; cancelled: number; skipped: number; from: string; to: string };

export async function syncDjen(ctx: TenantContext, monitorId: string, opts: { days?: number; http?: DjenHttp; pauseMs?: number } = {}): Promise<DjenSyncResult> {
  assertCan(ctx, "inbox:write");
  const m = await db.djenMonitor.findFirst({ where: { id: monitorId, organizationId: ctx.organizationId } });
  if (!m) throw new NotFoundError("Monitoramento não encontrado.");
  const today = todayYmd(ctx.timezone);
  const requested = opts.days && opts.days > 0 ? Math.min(opts.days, MAX_DAYS) : null;
  const from = requested ? addDays(today, -requested) : m.lastWindowEnd ? addDays(dateToYmd(m.lastWindowEnd), -OVERLAP_DAYS) : addDays(today, -FIRST_SYNC_DAYS);
  const record = (ok: boolean, msg: string, windowEnd?: string) =>
    db.djenMonitor.update({ where: { id: m.id }, data: { lastSyncAt: new Date(), lastStatus: ok ? "OK" : "ERROR", lastMessage: msg.slice(0, 300), ...(ok && windowEnd ? { lastWindowEnd: ymdToDate(windowEnd) } : {}) } });
  let items: DjenItem[];
  let skipped: number;
  try {
    ({ items, skipped } = await fetchDjen({ numeroOab: m.oabNumber, ufOab: m.oabUf, inicio: from, fim: today }, opts.http ?? defaultHttp, { pauseMs: opts.pauseMs }));
  } catch (err) {
    if (err instanceof DjenError) {
      await record(false, err.message);
      throw new ConflictError(err.message);
    }
    await record(false, "Falha de comunicação com o DJEN.");
    throw err;
  }
  let imported = 0;
  let alreadyKnown = 0;
  let cancelled = 0;
  for (const it of items) {
    if (it.cancelada) {
      cancelled++;
      continue;
    }
    const externalKey = `djen:${it.id}`;
    if (await db.courtNotice.findFirst({ where: { organizationId: ctx.organizationId, externalKey }, select: { id: true } })) {
      alreadyKnown++;
      continue;
    }
    const kind = kindOf(it);
    const cnj = cnjOf(it.numeroProcesso);
    const header = `Publicação no DJEN nº ${it.id}${it.tribunal ? ` — ${it.tribunal}` : ""}${it.orgao ? ` — ${it.orgao}` : ""}${it.classe ? ` (classe ${it.classe})` : ""}.\nCapturada pelo monitoramento da OAB ${m.oabUf} ${m.oabNumber}. Prazos criados a partir desta publicação continuam como rascunho até validação humana.\n\n`;
    try {
      const created = await createNotice(
        ctx,
        {
          source: "MANUAL",
          kind,
          title: `${KIND_LABEL[kind]} (DJEN)${cnj ? ` — processo ${cnj}` : ""}`.slice(0, 200),
          content: (header + it.texto).slice(0, 50_000),
          caseNumber: cnj ?? "",
          court: (it.tribunal ?? "DJEN").slice(0, 120),
          publishedAt: it.disponibilizadoEm ?? "",
          receivedAt: today,
          caseId: "",
        },
        { source: "IMPORTED", externalKey },
      );
      imported++;
      if (!created.duplicate && (m.defaultAssigneeId || m.defaultTeamId)) {
        // distribuir é uma conveniência: se falhar (ex.: o membro perdeu o acesso), a publicação continua na Entrada
        try {
          if (m.defaultAssigneeId) await assignNotice(ctx, created.id, { userId: m.defaultAssigneeId });
          else if (m.defaultTeamId) await assignNoticeToTeam(ctx, created.id, m.defaultTeamId);
        } catch {
          /* fica na Entrada */
        }
      }
    } catch (e) {
      if (isUniqueViolation(e)) alreadyKnown++;
      else throw e;
    }
  }
  await record(true, `${items.length} publicação(ões) de ${from} a ${today}; ${imported} nova(s).`, today);
  await audit({ action: "djen.sync", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "djen_monitor", resourceId: m.id, metadata: { found: items.length, imported, from, to: today }, meta: ctx.meta });
  return { found: items.length, imported, alreadyKnown, cancelled, skipped, from, to: today };
}

/** Execução automática (chamada pelo agendador externo): sincroniza todos os monitoramentos ligados, cada um com o contexto de quem o criou. */
export async function runDjenAll(opts: { http?: DjenHttp; pauseMs?: number } = {}) {
  const monitors = await db.djenMonitor.findMany({ where: { enabled: true, organization: { deletedAt: null, suspendedAt: null } }, select: { id: true, organizationId: true, createdById: true }, orderBy: { lastSyncAt: { sort: "asc", nulls: "first" } } });
  const out = { total: monitors.length, ok: 0, failed: 0, imported: 0 };
  for (const mon of monitors) {
    try {
      const ctx = await resolveTenantContext(mon.createdById, mon.organizationId, {});
      if (!ctx || !ctx.permissions.has("inbox:write")) {
        await db.djenMonitor.update({ where: { id: mon.id }, data: { lastSyncAt: new Date(), lastStatus: "ERROR", lastMessage: "Quem criou este monitoramento não tem mais acesso à caixa de entrada." } });
        out.failed++;
        continue;
      }
      const r = await syncDjen(ctx, mon.id, opts);
      out.ok++;
      out.imported += r.imported;
    } catch {
      out.failed++; // o motivo já ficou gravado no monitoramento
    }
  }
  return out;
}
