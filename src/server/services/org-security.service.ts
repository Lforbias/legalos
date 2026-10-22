import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { ipAllowed, normalizeIpEntry } from "@/lib/security/ip";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { getEntitlements } from "./plan.service";

/**
 * 4.0-F10 — segurança da conta do escritório + módulos por plano.
 * - IP permitido: só passa quem estiver na lista. TRAVA DE SEGURANÇA: não dá para ligar sem o IP de quem está configurando estar na lista.
 * - Saída por inatividade: sessão parada além do limite é encerrada na próxima requisição (mínimo 10 min).
 * - Sessões: dono/admin vê as sessões ativas da equipe e encerra qualquer uma.
 * - Módulos: o plano pode liberar só alguns (entradas "mod:campanhas" etc. em features). Plano sem nenhuma entrada "mod:" libera tudo.
 */

export const MODULES = {
  campanhas: "Campanhas em massa",
  ia: "Assistente de IA e transcrição",
  cofre: "Cofre de senhas dos clientes",
} as const;
export type ModuleKey = keyof typeof MODULES;
export const MIN_IDLE_MINUTES = 10;
export const MAX_IDLE_MINUTES = 1440;

// ---------- módulos ----------

export async function hasModule(organizationId: string, key: ModuleKey): Promise<boolean> {
  const e = await getEntitlements(organizationId);
  const mods = e.features.filter((f) => f.startsWith("mod:"));
  return mods.length === 0 || mods.includes(`mod:${key}`);
}

export async function assertModule(organizationId: string, key: ModuleKey): Promise<void> {
  if (!(await hasModule(organizationId, key))) {
    const e = await getEntitlements(organizationId);
    throw new ConflictError(`O módulo “${MODULES[key]}” não está incluído no plano ${e.planName ?? "atual"}. Peça um plano que o inclua.`);
  }
}

export async function modulesOf(organizationId: string): Promise<{ key: ModuleKey; label: string; enabled: boolean }[]> {
  const e = await getEntitlements(organizationId);
  const mods = e.features.filter((f) => f.startsWith("mod:"));
  return (Object.keys(MODULES) as ModuleKey[]).map((k) => ({ key: k, label: MODULES[k], enabled: mods.length === 0 || mods.includes(`mod:${k}`) }));
}

// ---------- configuração ----------

export async function getSecuritySettings(ctx: TenantContext) {
  assertCan(ctx, "organization:manage");
  const s = await db.orgSecuritySettings.findUnique({ where: { organizationId: ctx.organizationId } });
  return { ipAllowlist: s?.ipAllowlist ?? [], ipEnforced: s?.ipEnforced ?? false, idleLogoutMinutes: s?.idleLogoutMinutes ?? null, yourIp: ctx.meta.ipAddress ?? null };
}

export async function saveSecuritySettings(ctx: TenantContext, input: { ipAllowlist: string[]; ipEnforced: boolean; idleLogoutMinutes: number | null }) {
  assertCan(ctx, "organization:manage");
  const list: string[] = [];
  for (const raw of input.ipAllowlist.map((x) => x.trim()).filter(Boolean)) {
    const n = normalizeIpEntry(raw);
    if (!n) throw new ValidationError(`“${raw}” não é um IP válido. Use um IP (200.10.0.5) ou uma faixa (200.10.0.0/24).`, { ipAllowlist: [`IP inválido: ${raw}`] });
    if (!list.includes(n)) list.push(n);
  }
  if (list.length > 50) throw new ValidationError("No máximo 50 IPs ou faixas.", { ipAllowlist: ["Máximo 50."] });
  if (input.ipEnforced) {
    if (list.length === 0) throw new ValidationError("Informe ao menos um IP antes de ligar a restrição.", { ipAllowlist: ["Lista vazia."] });
    if (!ipAllowed(ctx.meta.ipAddress, list)) throw new ConflictError(`Seu IP atual (${ctx.meta.ipAddress ?? "desconhecido"}) não está na lista. Inclua-o antes de ligar, senão você ficaria sem acesso.`);
  }
  const idle = input.idleLogoutMinutes;
  if (idle !== null && (!Number.isInteger(idle) || idle < MIN_IDLE_MINUTES || idle > MAX_IDLE_MINUTES)) throw new ValidationError(`Informe de ${MIN_IDLE_MINUTES} a ${MAX_IDLE_MINUTES} minutos.`, { idleLogoutMinutes: ["Valor inválido."] });
  const data = { ipAllowlist: list, ipEnforced: input.ipEnforced, idleLogoutMinutes: idle, updatedById: ctx.userId };
  await db.orgSecuritySettings.upsert({ where: { organizationId: ctx.organizationId }, create: { organizationId: ctx.organizationId, ...data }, update: data });
  await audit({ action: "org.security_settings", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "organization", resourceId: ctx.organizationId, metadata: { ipEnforced: input.ipEnforced, ips: list.length, idle }, meta: ctx.meta });
  return list;
}

// ---------- verificação a cada requisição ----------

export type AccessVerdict = "ok" | "ip" | "idle";

/** Chamado em loadTenant. `previousSeen` = último uso da sessão ANTES desta requisição. Nunca lança. */
export async function checkOrgAccess(organizationId: string, ip: string | null, previousSeen: Date, now = new Date()): Promise<AccessVerdict> {
  try {
    const s = await db.orgSecuritySettings.findUnique({ where: { organizationId } });
    if (!s) return "ok";
    if (s.idleLogoutMinutes && now.getTime() - previousSeen.getTime() > s.idleLogoutMinutes * 60_000) return "idle";
    if (s.ipEnforced && s.ipAllowlist.length > 0 && !ipAllowed(ip, s.ipAllowlist)) return "ip";
    return "ok";
  } catch {
    return "ok"; // falha de leitura não derruba o sistema
  }
}

// ---------- sessões da equipe ----------

export async function listOrgSessions(ctx: TenantContext) {
  assertCan(ctx, "organization:manage");
  const rows = await db.session.findMany({
    where: { revokedAt: null, expiresAt: { gt: new Date() }, user: { memberships: { some: { organizationId: ctx.organizationId, status: "ACTIVE" } } } },
    orderBy: { lastSeenAt: "desc" }, take: 200,
    select: { id: true, userAgent: true, ipAddress: true, createdAt: true, lastSeenAt: true, userId: true, user: { select: { name: true, email: true } } },
  });
  return rows;
}

export async function revokeOrgSession(ctx: TenantContext, sessionId: string) {
  assertCan(ctx, "organization:manage");
  const s = await db.session.findFirst({ where: { id: sessionId, revokedAt: null, user: { memberships: { some: { organizationId: ctx.organizationId, status: "ACTIVE" } } } }, select: { id: true, userId: true } });
  if (!s) throw new NotFoundError("Sessão não encontrada.");
  await db.session.update({ where: { id: s.id }, data: { revokedAt: new Date() } });
  await audit({ action: "org.session_revoked", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "session", resourceId: s.id, metadata: { target: s.userId }, meta: ctx.meta });
}
