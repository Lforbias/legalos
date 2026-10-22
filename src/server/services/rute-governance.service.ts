import { db } from "@/lib/db/client";
import { assertCan, can, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";

/**
 * 6.0-F8 — governança: relatório de uso (em tokens, sem inventar custo em reais), histórico de uso das ferramentas
 * e relatório de LGPD (o que saiu do LegalOS, para qual IA, por quem e sobre qual cliente/processo). O TEXTO das consultas nunca é guardado.
 */
function monthRange(month?: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(month ?? "");
  const now = new Date();
  const y = m ? Number(m[1]) : now.getUTCFullYear();
  const mo = m ? Number(m[2]) - 1 : now.getUTCMonth();
  return { from: new Date(Date.UTC(y, mo, 1)), to: new Date(Date.UTC(y, mo + 1, 1)), label: `${y}-${String(mo + 1).padStart(2, "0")}` };
}

export async function usageReport(ctx: TenantContext, month?: string) {
  assertCan(ctx, "integrations:manage");
  const { from, to, label } = monthRange(month);
  const where = { organizationId: ctx.organizationId, createdAt: { gte: from, lt: to } };
  const [usage, tools, proposals] = await Promise.all([
    db.aiUsage.findMany({ where, select: { userId: true, feature: true, provider: true, inputTokens: true, outputTokens: true } }),
    db.aiToolLog.groupBy({ by: ["via", "tool", "ok"], where, _count: { _all: true } }),
    db.aiProposal.groupBy({ by: ["status"], where, _count: { _all: true } }),
  ]);
  const byUser = new Map<string, number>();
  const byFeature = new Map<string, number>();
  let total = 0;
  for (const u of usage) {
    const t = u.inputTokens + u.outputTokens;
    total += t;
    const uid = u.userId ?? "sistema";
    byUser.set(uid, (byUser.get(uid) ?? 0) + t);
    byFeature.set(u.feature, (byFeature.get(u.feature) ?? 0) + t);
  }
  const users = await db.user.findMany({ where: { id: { in: [...byUser.keys()] } }, select: { id: true, name: true } });
  const nm = new Map(users.map((u) => [u.id, u.name]));
  return {
    month: label,
    totalTokens: total,
    byUser: [...byUser.entries()].map(([id, tokens]) => ({ userId: id, name: nm.get(id) ?? (id === "sistema" ? "Sistema" : "Pessoa removida"), tokens })).sort((a, b) => b.tokens - a.tokens),
    byFeature: [...byFeature.entries()].map(([feature, tokens]) => ({ feature, tokens })).sort((a, b) => b.tokens - a.tokens),
    toolCalls: tools.map((t) => ({ via: t.via, tool: t.tool, ok: t.ok, count: t._count._all })).sort((a, b) => b.count - a.count),
    proposals: proposals.map((p) => ({ status: p.status, count: p._count._all })),
  };
}

export async function listToolHistory(ctx: TenantContext, limit = 100) {
  assertCan(ctx, "ai:use");
  const all = can(ctx, "integrations:manage");
  const rows = await db.aiToolLog.findMany({ where: { organizationId: ctx.organizationId, ...(all ? {} : { userId: ctx.userId }) }, orderBy: { createdAt: "desc" }, take: Math.min(limit, 300) });
  const users = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true } });
  const nm = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({ id: r.id, when: r.createdAt, who: nm.get(r.userId) ?? "—", via: r.via, connection: r.connection, tool: r.tool, ok: r.ok, ms: r.ms }));
}

export type LgpdRow = { when: Date; who: string; provider: string; via: string; tool: string; client: string | null; case: string | null; chars: number };

export async function lgpdReport(ctx: TenantContext, month?: string) {
  assertCan(ctx, "integrations:manage");
  const { from, to, label } = monthRange(month);
  const rows = await db.aiSendLog.findMany({ where: { organizationId: ctx.organizationId, createdAt: { gte: from, lt: to } }, orderBy: { createdAt: "desc" }, take: 2000 });
  const [users, clients, cases] = await Promise.all([
    db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true } }),
    db.client.findMany({ where: { organizationId: ctx.organizationId, id: { in: [...new Set(rows.map((r) => r.clientId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } }),
    db.case.findMany({ where: { organizationId: ctx.organizationId, id: { in: [...new Set(rows.map((r) => r.caseId).filter((x): x is string => !!x))] } }, select: { id: true, title: true } }),
  ]);
  const un = new Map(users.map((u) => [u.id, u.name]));
  const cn = new Map(clients.map((c) => [c.id, c.name]));
  const kn = new Map(cases.map((c) => [c.id, c.title]));
  const list: LgpdRow[] = rows.map((r) => ({ when: r.createdAt, who: un.get(r.userId) ?? "—", provider: r.provider, via: r.via, tool: r.tool, client: r.clientId ? (cn.get(r.clientId) ?? "(removido)") : null, case: r.caseId ? (kn.get(r.caseId) ?? "(removido)") : null, chars: r.chars }));
  const byProvider = new Map<string, number>();
  const distinctClients = new Set<string>();
  for (const r of rows) {
    byProvider.set(r.provider, (byProvider.get(r.provider) ?? 0) + 1);
    if (r.clientId) distinctClients.add(r.clientId);
  }
  return { month: label, total: rows.length, distinctClients: distinctClients.size, byProvider: [...byProvider.entries()].map(([provider, count]) => ({ provider, count })), rows: list };
}

const csvCell = (v: string | number | null) => {
  let s = v === null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

export async function lgpdCsv(ctx: TenantContext, month?: string): Promise<{ csv: string; filename: string }> {
  const r = await lgpdReport(ctx, month);
  const head = ["Data/hora (UTC)", "Pessoa", "IA (provedor)", "Origem", "Consulta", "Cliente", "Processo", "Caracteres enviados"];
  const lines = [head.map(csvCell).join(",")];
  for (const x of r.rows) lines.push([x.when.toISOString(), x.who, x.provider, x.via, x.tool, x.client, x.case, x.chars].map(csvCell).join(","));
  await audit({ action: "rute.lgpd.export", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "organization", resourceId: ctx.organizationId, metadata: { month: r.month, rows: r.rows.length }, meta: ctx.meta });
  return { csv: `﻿${lines.join("\r\n")}\r\n`, filename: `legalos-lgpd-ia-${r.month}.csv` };
}
