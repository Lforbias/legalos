import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { assertCan, can, type RequestMeta, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { authenticateApiKey } from "./apikey.service";
import { assertRuteOn } from "./rute-settings.service";
import type { ToolScope } from "./rute-tools.service";
import { resolveTenantContext } from "./tenant.service";

/**
 * 6.0 — autenticação do servidor MCP. Duas portas:
 *  1) OAuth 2.1 (Claude, ChatGPT…): cadastro dinâmico de cliente, código + PKCE S256, token de acesso 1 h, renovação 30 dias com rotação.
 *  2) Chave de API `lgos_…` com escopo mcp:read / mcp:propose (Gemini CLI, Claude Code, scripts).
 * Em ambas a IA age COMO A PESSOA que conectou: mesmas permissões e mesmo sigilo.
 */
export const MCP_SCOPES = { "mcp:execute": "Criar e alterar registros diretamente, sem aprovação posterior", "mcp:read": "Consultar processos, clientes, prazos, tarefas e intimações (somente leitura)", "mcp:propose": "Propor tarefas, prazos, anotações e minutas (nada vale sem a sua confirmação)" } as const;
export type McpScope = keyof typeof MCP_SCOPES;
export const MCP_SCOPE_LIST = Object.keys(MCP_SCOPES) as McpScope[];

const ACCESS_TTL_MS = 60 * 60_000;
const REFRESH_TTL_MS = 30 * 86_400_000;
const CODE_TTL_MS = 5 * 60_000;
const MAX_CLIENTS = 5000;
const MAX_ACTIVE_PER_USER = 25;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const b64url = (b: Buffer) => b.toString("base64url");
const eq = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export class OAuthError extends Error {
  constructor(public code: "invalid_request" | "invalid_client" | "invalid_grant" | "invalid_scope" | "unsupported_grant_type" | "invalid_redirect_uri" | "invalid_client_metadata", message: string) {
    super(message);
  }
}

export const toolScopes = (scopes: Iterable<string>): Set<ToolScope> => {
  const out = new Set<ToolScope>();
  for (const s of scopes) {
    if (s === "mcp:read") out.add("read");
    if (s === "mcp:execute") out.add("execute");
    if (s === "mcp:propose") out.add("propose");
  }
  return out;
};

export function parseScopes(raw: string | null | undefined): McpScope[] {
  const asked = (raw ?? "").split(/\s+/).filter(Boolean);
  if (asked.length === 0) return ["mcp:read", "mcp:propose"];
  if (asked.some((s) => !(s in MCP_SCOPES))) throw new OAuthError("invalid_scope", "Escopo desconhecido.");
  return [...new Set(asked)] as McpScope[];
}

/** Só HTTPS (ou http em loopback para ferramentas locais). Sem fragmento. */
export function validRedirectUri(u: string): boolean {
  if (u.length > 500) return false;
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

export async function registerClient(input: { client_name?: unknown; redirect_uris?: unknown }) {
  const name = typeof input.client_name === "string" ? input.client_name.trim().slice(0, 80) : "";
  const uris = Array.isArray(input.redirect_uris) ? input.redirect_uris.filter((x): x is string => typeof x === "string") : [];
  if (uris.length === 0 || uris.length > 5 || uris.length !== (input.redirect_uris as unknown[]).length) throw new OAuthError("invalid_redirect_uri", "Informe de 1 a 5 redirect_uris.");
  if (!uris.every(validRedirectUri)) throw new OAuthError("invalid_redirect_uri", "redirect_uri inválido (use https ou localhost).");
  if ((await db.mcpOAuthClient.count()) >= MAX_CLIENTS) throw new OAuthError("invalid_client_metadata", "Limite de aplicativos cadastrados atingido.");
  const clientId = `mcpc_${randomBytes(16).toString("hex")}`;
  const c = await db.mcpOAuthClient.create({ data: { clientId, name: name || "Aplicativo de IA", redirectUris: [...new Set(uris)] } });
  return { clientId: c.clientId, name: c.name, redirectUris: c.redirectUris };
}

export async function getClient(clientId: string) {
  if (!/^mcpc_[0-9a-f]{32}$/.test(clientId)) return null;
  return db.mcpOAuthClient.findUnique({ where: { clientId } });
}

async function requireMfa(userId: string) {
  const m = await db.userMfa.findUnique({ where: { userId }, select: { enabledAt: true } });
  if (!m?.enabledAt) throw new ConflictError("Ative a verificação em duas etapas em Minha conta antes de conectar uma IA.");
}

/** Chamado pela tela de consentimento, já com a pessoa logada, após ela clicar em "Permitir". */
export async function createAuthCode(ctx: TenantContext, input: { clientId: string; redirectUri: string; codeChallenge: string; scopes: McpScope[] }) {
  assertCan(ctx, "ai:use");
  await assertRuteOn(ctx.organizationId, "mcp");
  await requireMfa(ctx.userId);
  const client = await getClient(input.clientId);
  if (!client || !client.redirectUris.includes(input.redirectUri)) throw new ValidationError("Aplicativo ou endereço de retorno não reconhecido.");
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.codeChallenge)) throw new ValidationError("Desafio PKCE inválido.");
  const scopes = input.scopes.filter((s) => s in MCP_SCOPES);
  if (scopes.length === 0) throw new ValidationError("Escolha ao menos um acesso.");
  const active = await db.mcpOAuthToken.count({ where: { organizationId: ctx.organizationId, userId: ctx.userId, revokedAt: null, refreshExpiresAt: { gt: new Date() } } });
  if (active >= MAX_ACTIVE_PER_USER) throw new ConflictError(`Você já tem ${MAX_ACTIVE_PER_USER} conexões ativas. Revogue alguma antes.`);
  await db.mcpOAuthCode.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 3_600_000) } } });
  const code = b64url(randomBytes(32));
  await db.mcpOAuthCode.create({
    data: { organizationId: ctx.organizationId, userId: ctx.userId, clientId: client.clientId, codeHash: sha256(code), scopes, codeChallenge: input.codeChallenge, redirectUri: input.redirectUri, expiresAt: new Date(Date.now() + CODE_TTL_MS) },
  });
  await audit({ action: "rute.mcp.authorize", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "mcp_client", resourceId: client.clientId, metadata: { client: client.name, scopes }, meta: ctx.meta });
  return { code, clientName: client.name };
}

function issue() {
  return { access: `lgmcp_a_${b64url(randomBytes(32))}`, refresh: `lgmcp_r_${b64url(randomBytes(32))}` };
}
const tokenBody = (t: { access: string; refresh: string }, scopes: string[]) => ({ access_token: t.access, token_type: "Bearer" as const, expires_in: ACCESS_TTL_MS / 1000, refresh_token: t.refresh, scope: scopes.join(" ") });

export async function exchangeCode(input: { code: string; clientId: string; redirectUri: string; codeVerifier: string }) {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(input.codeVerifier)) throw new OAuthError("invalid_request", "code_verifier inválido.");
  const codeHash = sha256(input.code);
  const row = await db.mcpOAuthCode.findUnique({ where: { codeHash } });
  if (!row || row.clientId !== input.clientId || row.redirectUri !== input.redirectUri || row.expiresAt <= new Date()) throw new OAuthError("invalid_grant", "Código inválido ou expirado.");
  const challenge = b64url(createHash("sha256").update(input.codeVerifier).digest());
  if (!eq(challenge, row.codeChallenge)) throw new OAuthError("invalid_grant", "Verificação PKCE falhou.");
  const claimed = await db.mcpOAuthCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) {
    // Código reutilizado: derruba o que foi emitido a partir dele (suspeita de interceptação).
    await db.mcpOAuthToken.updateMany({ where: { organizationId: row.organizationId, userId: row.userId, clientId: row.clientId, createdAt: { gte: row.createdAt }, revokedAt: null }, data: { revokedAt: new Date() } });
    throw new OAuthError("invalid_grant", "Código já utilizado.");
  }
  const client = await getClient(row.clientId);
  const t = issue();
  const now = Date.now();
  await db.mcpOAuthToken.create({
    data: {
      organizationId: row.organizationId, userId: row.userId, clientId: row.clientId, clientName: client?.name ?? "Aplicativo de IA", scopes: row.scopes,
      accessHash: sha256(t.access), refreshHash: sha256(t.refresh), accessExpiresAt: new Date(now + ACCESS_TTL_MS), refreshExpiresAt: new Date(now + REFRESH_TTL_MS),
    },
  });
  return tokenBody(t, row.scopes);
}

export async function refreshTokens(input: { refreshToken: string; clientId: string }) {
  const row = await db.mcpOAuthToken.findUnique({ where: { refreshHash: sha256(input.refreshToken) } });
  if (!row || row.clientId !== input.clientId || row.revokedAt || row.refreshExpiresAt <= new Date()) throw new OAuthError("invalid_grant", "Renovação inválida, expirada ou revogada.");
  const t = issue();
  const now = Date.now();
  // Rotação: o refresh antigo deixa de existir na mesma operação (reuso => invalid_grant).
  const res = await db.mcpOAuthToken.updateMany({
    where: { id: row.id, refreshHash: row.refreshHash, revokedAt: null },
    data: { accessHash: sha256(t.access), refreshHash: sha256(t.refresh), accessExpiresAt: new Date(now + ACCESS_TTL_MS), refreshExpiresAt: new Date(now + REFRESH_TTL_MS) },
  });
  if (res.count !== 1) throw new OAuthError("invalid_grant", "Renovação inválida.");
  return tokenBody(t, row.scopes);
}

export type McpPrincipal = { id: string; kind: "OAUTH" | "KEY"; connection: string; scopes: Set<ToolScope>; ctx: TenantContext };

export async function authenticateMcpBearer(token: string, meta: RequestMeta = {}): Promise<McpPrincipal | null> {
  const t = token.trim();
  if (t.startsWith("lgos_")) {
    const p = await authenticateApiKey(t, meta);
    if (!p) return null;
    const scopes = new Set<ToolScope>();
    if (p.scopes.has("mcp:read")) scopes.add("read");
    if (p.scopes.has("mcp:execute")) scopes.add("execute");
    if (p.scopes.has("mcp:propose")) scopes.add("propose");
    if (scopes.size === 0) return null;
    const k = await db.apiKey.findUnique({ where: { id: p.keyId }, select: { name: true } });
    return { id: p.keyId, kind: "KEY", connection: `Chave: ${k?.name ?? "sem nome"}`, scopes, ctx: p.ctx };
  }
  if (!t.startsWith("lgmcp_a_")) return null;
  const row = await db.mcpOAuthToken.findUnique({ where: { accessHash: sha256(t) } });
  if (!row || row.revokedAt || row.accessExpiresAt <= new Date()) return null;
  const ctx = await resolveTenantContext(row.userId, row.organizationId, meta);
  if (!ctx || !can(ctx, "ai:use")) return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) await db.mcpOAuthToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  return { id: row.id, kind: "OAUTH", connection: row.clientName, scopes: toolScopes(row.scopes), ctx };
}

export type McpConnection = {
  id: string; kind: "OAUTH" | "KEY"; name: string; scopes: string[]; userId: string | null; userName: string | null;
  lastUsedAt: Date | null; createdAt: Date; expiresAt: Date | null; status: "ACTIVE" | "REVOKED" | "EXPIRED";
};

/** Quem administra integrações vê todas as conexões do escritório; os demais veem só as suas. */
export async function listMcpConnections(ctx: TenantContext): Promise<McpConnection[]> {
  assertCan(ctx, "ai:use");
  const all = can(ctx, "integrations:manage");
  const now = new Date();
  const toks = await db.mcpOAuthToken.findMany({ where: { organizationId: ctx.organizationId, ...(all ? {} : { userId: ctx.userId }) }, orderBy: { createdAt: "desc" }, take: 100 });
  const users = await db.user.findMany({ where: { id: { in: [...new Set(toks.map((t) => t.userId))] } }, select: { id: true, name: true } });
  const nm = new Map(users.map((u) => [u.id, u.name]));
  const out: McpConnection[] = toks.map((t) => ({
    id: t.id, kind: "OAUTH", name: t.clientName, scopes: t.scopes, userId: t.userId, userName: nm.get(t.userId) ?? null, lastUsedAt: t.lastUsedAt, createdAt: t.createdAt, expiresAt: t.refreshExpiresAt,
    status: t.revokedAt ? "REVOKED" : t.refreshExpiresAt <= now ? "EXPIRED" : "ACTIVE",
  }));
  if (all) {
    const keys = await db.apiKey.findMany({ where: { organizationId: ctx.organizationId, OR: [{ scopes: { has: "mcp:read" } }, { scopes: { has: "mcp:propose" } }, { scopes: { has: "mcp:execute" } }] }, orderBy: { createdAt: "desc" }, take: 100 });
    const ku = await db.user.findMany({ where: { id: { in: keys.map((k) => k.createdById).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
    const kn = new Map(ku.map((u) => [u.id, u.name]));
    for (const k of keys) {
      out.push({ id: k.id, kind: "KEY", name: k.name, scopes: k.scopes.filter((s) => s.startsWith("mcp:")), userId: k.createdById, userName: k.createdById ? (kn.get(k.createdById) ?? null) : null, lastUsedAt: k.lastUsedAt, createdAt: k.createdAt, expiresAt: k.expiresAt, status: k.revokedAt ? "REVOKED" : k.expiresAt && k.expiresAt <= now ? "EXPIRED" : "ACTIVE" });
    }
  }
  return out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function revokeMcpConnection(ctx: TenantContext, id: string) {
  assertCan(ctx, "ai:use");
  const all = can(ctx, "integrations:manage");
  const res = await db.mcpOAuthToken.updateMany({ where: { id, organizationId: ctx.organizationId, revokedAt: null, ...(all ? {} : { userId: ctx.userId }) }, data: { revokedAt: new Date() } });
  if (res.count === 1) {
    await audit({ action: "rute.mcp.revoke", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "mcp_token", resourceId: id, meta: ctx.meta });
    return;
  }
  if (all) {
    const k = await db.apiKey.updateMany({ where: { id, organizationId: ctx.organizationId, revokedAt: null }, data: { revokedAt: new Date(), revokedById: ctx.userId } });
    if (k.count === 1) {
      await audit({ action: "rute.mcp.revoke", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "api_key", resourceId: id, meta: ctx.meta });
      return;
    }
  }
  throw new NotFoundError("Conexão não encontrada ou já revogada.");
}
