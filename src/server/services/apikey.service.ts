import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db/client";
import type { PermissionKey } from "@/lib/permissions/catalog";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { assertCan, can, type RequestMeta, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { resolveTenantContext } from "./tenant.service";

/** Escopos da API pública. Cada escopo exige, além disso, a permissão equivalente de quem criou a chave. */
export const API_SCOPES = {
  "chat:send": { label: "Chat: enviar mensagem aprovada por pessoa", permission: "whatsapp:write" },
  "cases:read": { label: "Ler processos", permission: "cases:read" },
  "clients:read": { label: "Ler clientes", permission: "clients:read" },
  "deadlines:read": { label: "Ler prazos", permission: "deadlines:read" },
  "notices:read": { label: "Ler intimações", permission: "inbox:read" },
  "notices:write": { label: "Registrar intimações", permission: "inbox:write" },
  "tools:read": { label: "Ferramentas via API: consultar dados", permission: "ai:use" },
  "tools:execute": { label: "Ferramentas via API: criar e alterar diretamente (sem aprovação posterior)", permission: "ai:use" },
  "mcp:execute": { label: "MCP: criar e alterar diretamente (sem aprovação posterior)", permission: "ai:use" },
  "tools:propose": { label: "Ferramentas via API: propor ações para aprovação", permission: "ai:use" },
  "mcp:read": { label: "RUTE: consultar dados (somente leitura)", permission: "ai:use" },
  "mcp:propose": { label: "RUTE: propor ações (só valem após confirmação humana)", permission: "ai:use" },
} as const satisfies Record<string, { label: string; permission: PermissionKey }>;
export type ApiScope = keyof typeof API_SCOPES;
export const API_SCOPE_LIST = Object.keys(API_SCOPES) as ApiScope[];

const MAX_ACTIVE_KEYS = 20;
const TOKEN_RE = /^lgos_([0-9a-f]{8})_([A-Za-z0-9_-]{43})$/;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function requireMfa(userId: string) {
  const m = await db.userMfa.findUnique({ where: { userId }, select: { enabledAt: true } });
  if (!m?.enabledAt) throw new ConflictError("Ative a verificação em duas etapas em Minha conta para gerenciar chaves de API.");
}

export type ApiKeyInput = { name: string; scopes: string[]; expiresInDays?: number | null };

export async function createApiKey(ctx: TenantContext, input: ApiKeyInput) {
  assertCan(ctx, "integrations:manage");
  await requireMfa(ctx.userId);
  const name = input.name.trim();
  if (name.length < 3 || name.length > 80) throw new ValidationError("Nome inválido.", { name: ["Informe um nome de 3 a 80 caracteres."] });
  const scopes = [...new Set(input.scopes)];
  if (scopes.length === 0 || scopes.some((s) => !Object.hasOwn(API_SCOPES, s))) throw new ValidationError("Escolha ao menos um acesso válido.", { scopes: ["Escolha ao menos um acesso."] });
  for (const s of scopes) {
    if (!can(ctx, API_SCOPES[s as ApiScope].permission)) throw new ValidationError("Você não tem permissão para conceder um dos acessos escolhidos.", { scopes: [`Seu perfil não permite: ${API_SCOPES[s as ApiScope].label}.`] });
  }
  const days = input.expiresInDays ?? null;
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 730)) throw new ValidationError("Validade inválida.", { expiresInDays: ["Use de 1 a 730 dias, ou deixe sem validade."] });
  const active = await db.apiKey.count({ where: { organizationId: ctx.organizationId, revokedAt: null } });
  if (active >= MAX_ACTIVE_KEYS) throw new ConflictError(`Limite de ${MAX_ACTIVE_KEYS} chaves ativas. Revogue alguma antes de criar outra.`);
  const prefix = randomBytes(4).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  const token = `lgos_${prefix}_${secret}`;
  const row = await db.$transaction(async (tx) => {
    const k = await tx.apiKey.create({
      data: { organizationId: ctx.organizationId, name, prefix, keyHash: sha256(secret), scopes, createdById: ctx.userId, expiresAt: days ? new Date(Date.now() + days * 86_400_000) : null },
      select: { id: true },
    });
    await audit({ action: "apikey.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "api_key", resourceId: k.id, metadata: { scopes, expiresInDays: days }, meta: ctx.meta }, tx);
    return k;
  });
  return { id: row.id, token };
}

export async function listApiKeys(ctx: TenantContext) {
  assertCan(ctx, "integrations:manage");
  const rows = await db.apiKey.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, name: true, prefix: true, scopes: true, expiresAt: true, lastUsedAt: true, revokedAt: true, createdAt: true },
  });
  const now = new Date();
  return rows.map((r) => ({ ...r, status: r.revokedAt ? ("REVOKED" as const) : r.expiresAt && r.expiresAt <= now ? ("EXPIRED" as const) : ("ACTIVE" as const) }));
}

export async function revokeApiKey(ctx: TenantContext, id: string) {
  assertCan(ctx, "integrations:manage");
  await requireMfa(ctx.userId);
  const res = await db.apiKey.updateMany({ where: { id, organizationId: ctx.organizationId, revokedAt: null }, data: { revokedAt: new Date(), revokedById: ctx.userId } });
  if (res.count !== 1) throw new NotFoundError("Chave não encontrada ou já revogada.");
  await audit({ action: "apikey.revoke", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "api_key", resourceId: id, meta: ctx.meta });
}

export type ApiPrincipal = { keyId: string; scopes: ReadonlySet<ApiScope>; ctx: TenantContext };

/**
 * Autentica um token `lgos_<prefixo>_<segredo>`. A chave age como quem a criou (mesmas regras de sigilo e
 * permissões, limitadas aos escopos). Se o criador deixar o escritório ou perder a permissão, a chave para de funcionar.
 */
export async function authenticateApiKey(token: string, meta: RequestMeta = {}): Promise<ApiPrincipal | null> {
  const m = TOKEN_RE.exec(token.trim());
  if (!m) return null;
  const prefix = m[1] as string;
  const secret = m[2] as string;
  const key = await db.apiKey.findUnique({ where: { prefix } });
  const given = Buffer.from(sha256(secret));
  const real = Buffer.from(key?.keyHash ?? "0".repeat(64));
  const same = given.length === real.length && timingSafeEqual(given, real);
  if (!key || !same || key.revokedAt || (key.expiresAt && key.expiresAt <= new Date()) || !key.createdById) return null;
  const ctx = await resolveTenantContext(key.createdById, key.organizationId, meta);
  if (!ctx) return null;
  const scopes = new Set<ApiScope>();
  for (const s of key.scopes) {
    const def = API_SCOPES[s as ApiScope];
    if (def && can(ctx, def.permission)) scopes.add(s as ApiScope);
  }
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 5 * 60_000) {
    await db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }
  return { keyId: key.id, scopes, ctx };
}
