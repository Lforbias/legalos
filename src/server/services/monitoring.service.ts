import { db } from "@/lib/db/client";
import { assertCan, type TenantContext } from "@/server/context";
import { notify } from "./notification.service";

/** Fonte parada: monitoramento ligado sem rodar há mais que isso (cron roda a cada 30 min). */
export const STALE_HOURS = 36;
const HOUR = 3_600_000;

export type SourceHealth = "OK" | "ERROR" | "STALE" | "NEVER" | "OFF";
export type SourceRow = { kind: "DJEN" | "MNI"; id: string; label: string; detail: string; enabled: boolean; health: SourceHealth; lastSyncAt: Date | null; message: string | null };

/** Saúde de uma fonte. Desligada nunca alerta; ligada e sem execução é "NEVER"; execução antiga é "STALE" (mesmo se o último status foi OK). */
export function classifySource(s: { enabled: boolean; lastSyncAt: Date | null; lastStatus: string | null }, now = new Date()): SourceHealth {
  if (!s.enabled) return "OFF";
  if (!s.lastSyncAt) return "NEVER";
  if (s.lastStatus === "ERROR") return "ERROR";
  if (now.getTime() - s.lastSyncAt.getTime() > STALE_HOURS * HOUR) return "STALE";
  return "OK";
}

async function loadSources(organizationId?: string) {
  const where = { ...(organizationId ? { organizationId } : {}) };
  const [djen, mni] = await Promise.all([
    db.djenMonitor.findMany({ where, orderBy: { createdAt: "asc" }, select: { id: true, organizationId: true, label: true, oabNumber: true, oabUf: true, enabled: true, lastSyncAt: true, lastStatus: true, lastMessage: true } }),
    db.courtConnection.findMany({ where, orderBy: { createdAt: "asc" }, select: { id: true, organizationId: true, label: true, jtr: true, enabled: true, lastSyncAt: true, lastStatus: true, lastMessage: true } }),
  ]);
  return [
    ...djen.map((m) => ({ organizationId: m.organizationId, row: { kind: "DJEN" as const, id: m.id, label: m.label, detail: `OAB ${m.oabNumber}/${m.oabUf}`, enabled: m.enabled, lastSyncAt: m.lastSyncAt, lastStatus: m.lastStatus, message: m.lastMessage } })),
    ...mni.map((c) => ({ organizationId: c.organizationId, row: { kind: "MNI" as const, id: c.id, label: c.label, detail: `Tribunal ${c.jtr}`, enabled: c.enabled, lastSyncAt: c.lastSyncAt, lastStatus: c.lastStatus, message: c.lastMessage } })),
  ];
}

/** Painel de saúde do monitoramento de intimações (DJEN + PJe/MNI) do escritório. */
export async function getMonitoringOverview(ctx: TenantContext, now = new Date()) {
  assertCan(ctx, "integrations:manage");
  const sources = (await loadSources(ctx.organizationId)).map(({ row }) => ({
    kind: row.kind, id: row.id, label: row.label, detail: row.detail, enabled: row.enabled,
    health: classifySource(row, now), lastSyncAt: row.lastSyncAt, message: row.message,
  })) satisfies SourceRow[];
  const since = new Date(now.getTime() - 7 * 24 * HOUR);
  const imported = await db.courtNotice.findMany({ where: { organizationId: ctx.organizationId, source: "IMPORTED", deletedAt: null, createdAt: { gte: since } }, select: { createdAt: true } });
  const byDay = new Map<string, number>();
  for (let i = 6; i >= 0; i--) byDay.set(new Date(now.getTime() - i * 24 * HOUR).toISOString().slice(0, 10), 0);
  for (const n of imported) {
    const k = n.createdAt.toISOString().slice(0, 10);
    if (byDay.has(k)) byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }
  const problems = sources.filter((s) => s.health === "ERROR" || s.health === "STALE").length;
  return { sources, problems, importedByDay: [...byDay].map(([day, count]) => ({ day, count })), importedTotal: imported.length, staleHours: STALE_HOURS };
}

/** Avisa quem administra integrações quando uma fonte falha ou para. Idempotente por fonte + última execução. */
export async function runMonitoringCheck(organizationId?: string, now = new Date()): Promise<{ checked: number; alerts: number }> {
  const all = await loadSources(organizationId);
  const bad = all.map((a) => ({ ...a, health: classifySource(a.row, now) })).filter((a) => a.health === "ERROR" || a.health === "STALE");
  let alerts = 0;
  const admins = new Map<string, string[]>();
  for (const a of bad) {
    if (!admins.has(a.organizationId)) {
      const rows = await db.membership.findMany({ where: { organizationId: a.organizationId, status: "ACTIVE", role: { permissions: { has: "integrations:manage" } } }, select: { userId: true } });
      admins.set(a.organizationId, rows.map((r) => r.userId));
    }
    const stamp = a.row.lastSyncAt ? a.row.lastSyncAt.toISOString() : "never";
    const what = a.row.kind === "DJEN" ? "Monitoramento do DJEN" : "Sincronização PJe/MNI";
    const title = a.health === "ERROR" ? `${what} com erro: ${a.row.label}` : `${what} parado: ${a.row.label}`;
    const body = a.health === "ERROR" ? "A última captura falhou. Intimações novas podem não estar chegando; confira a conexão." : `Sem execução há mais de ${STALE_HOURS} horas. Intimações novas podem não estar chegando.`;
    alerts += await notify((admins.get(a.organizationId) ?? []).map((userId) => ({ organizationId: a.organizationId, userId, kind: "MONITORING_ALERT", title, body, link: "/monitoramento", dedupeKey: `monitoring:${a.row.kind}:${a.row.id}:${a.health}:${stamp}` })));
  }
  return { checked: all.length, alerts };
}
