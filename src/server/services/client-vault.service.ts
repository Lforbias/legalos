import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { certKey, openBytes, sealBytes } from "@/lib/security/pfx";
import { RateLimiter } from "@/lib/security/rate-limit";
import { assertCan, can, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { requireMfa } from "./certificate.service";
import { verifySecondFactor } from "./mfa.service";

/**
 * 2.0-F11 — cofre de credenciais de CLIENTES (ex.: Meu INSS, gov.br, e-CAC). Mínimo de acesso:
 * - ver a lista (sem segredo) e cadastrar exigem `vault:manage`/`vault:read`; só OWNER e ADMIN nascem com isso;
 * - o segredo é cifrado (mesma chave do cofre) e NUNCA vai para a lista, para logs nem para a auditoria;
 * - para VER a senha é preciso `vault:read`, 2FA ativo E digitar o código do 2FA na hora; cada abertura fica na auditoria
 *   e na própria credencial (quem e quando); limite de tentativas por pessoa.
 */

const SYSTEMS = ["Meu INSS", "gov.br", "e-CAC (Receita)", "Portal do tribunal", "Banco / outro", "Outro"] as const;
export const VAULT_SYSTEMS = SYSTEMS;
const limiter = new RateLimiter(10, 10 * 60_000);

function key(): Buffer {
  const k = certKey();
  if (!k) throw new ConflictError("O cofre não está configurado neste sistema (falta CERT_ENCRYPTION_KEY).");
  return k;
}

type Secret = { login: string; password: string; notes: string };
const clean = (s: string | undefined, max: number) => (s ?? "").trim().slice(0, max);

async function client(ctx: TenantContext, id: string) {
  assertCan(ctx, "clients:read");
  const c = await db.client.findFirst({ where: { id, organizationId: ctx.organizationId, deletedAt: null }, select: { id: true, name: true } });
  if (!c) throw new NotFoundError("Cliente não encontrado.");
  return c;
}

export async function listClientCredentials(ctx: TenantContext, clientId: string) {
  if (!can(ctx, "vault:read") && !can(ctx, "vault:manage")) assertCan(ctx, "vault:read");
  await client(ctx, clientId);
  const rows = await db.clientCredential.findMany({ where: { organizationId: ctx.organizationId, clientId }, orderBy: { createdAt: "asc" }, select: { id: true, system: true, label: true, createdAt: true, updatedAt: true, lastRevealedAt: true, lastRevealedById: true } });
  const ids = [...new Set(rows.map((r) => r.lastRevealedById).filter((x): x is string => !!x))];
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  return rows.map((r) => ({ id: r.id, system: r.system, label: r.label, createdAt: r.createdAt, updatedAt: r.updatedAt, lastRevealedAt: r.lastRevealedAt, lastRevealedBy: users.find((u) => u.id === r.lastRevealedById)?.name ?? null }));
}

export async function saveClientCredential(ctx: TenantContext, clientId: string, id: string | null, input: { system: string; label: string; login: string; password: string; notes?: string }) {
  assertCan(ctx, "vault:manage");
  const k = key();
  await requireMfa(ctx.userId);
  await client(ctx, clientId);
  const system = clean(input.system, 40);
  const label = clean(input.label, 80);
  if (!system) throw new ValidationError("Escolha o sistema.", { system: ["Escolha o sistema."] });
  if (label.length < 2) throw new ValidationError("Dê um nome à credencial.", { label: ["Dê um nome à credencial (ex.: Meu INSS da Maria)."] });
  const login = clean(input.login, 200);
  const password = (input.password ?? "").slice(0, 200);
  if (!login) throw new ValidationError("Informe o usuário ou CPF de acesso.", { login: ["Informe o usuário ou CPF de acesso."] });
  if (!password && !id) throw new ValidationError("Informe a senha.", { password: ["Informe a senha."] });
  let secret: Secret = { login, password, notes: clean(input.notes, 500) };
  if (id) {
    const cur = await db.clientCredential.findFirst({ where: { id, organizationId: ctx.organizationId, clientId }, select: { secretEnc: true } });
    if (!cur) throw new NotFoundError("Credencial não encontrada.");
    if (!password) secret = { ...secret, password: (JSON.parse(openBytes(cur.secretEnc, k).toString("utf8")) as Secret).password }; // senha em branco = manter
    await db.clientCredential.update({ where: { id }, data: { system, label, secretEnc: sealBytes(Buffer.from(JSON.stringify(secret), "utf8"), k), updatedById: ctx.userId } });
    await audit({ action: "vault.update", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "client_credential", resourceId: id, metadata: { system }, meta: ctx.meta });
    return { id };
  }
  const row = await db.clientCredential.create({ data: { organizationId: ctx.organizationId, clientId, system, label, secretEnc: sealBytes(Buffer.from(JSON.stringify(secret), "utf8"), k), createdById: ctx.userId, updatedById: ctx.userId }, select: { id: true } });
  await audit({ action: "vault.create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "client_credential", resourceId: row.id, metadata: { system }, meta: ctx.meta });
  return row;
}

export async function deleteClientCredential(ctx: TenantContext, id: string) {
  assertCan(ctx, "vault:manage");
  const r = await db.clientCredential.deleteMany({ where: { id, organizationId: ctx.organizationId } });
  if (r.count !== 1) throw new NotFoundError("Credencial não encontrada.");
  await audit({ action: "vault.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "client_credential", resourceId: id, meta: ctx.meta });
}

/** Abre a credencial: exige `vault:read`, 2FA ativo e o código do 2FA digitado agora. Registra quem abriu. */
export async function revealClientCredential(ctx: TenantContext, id: string, code: string): Promise<{ login: string; password: string; notes: string; system: string; label: string }> {
  assertCan(ctx, "vault:read");
  const k = key();
  await requireMfa(ctx.userId);
  if (!limiter.check(ctx.userId)) throw new ConflictError("Muitas tentativas. Aguarde alguns minutos.");
  const row = await db.clientCredential.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true, system: true, label: true, secretEnc: true } });
  if (!row) throw new NotFoundError("Credencial não encontrada.");
  const ok = await verifySecondFactor(ctx.userId, code ?? "");
  if (!ok) {
    await audit({ action: "vault.reveal_denied", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "client_credential", resourceId: id, meta: ctx.meta });
    throw new ValidationError("Código de verificação inválido.", { code: ["Código inválido. Use o código atual do aplicativo (cada código vale uma vez)."] });
  }
  const s = JSON.parse(openBytes(row.secretEnc, k).toString("utf8")) as Secret;
  await db.clientCredential.update({ where: { id }, data: { lastRevealedAt: new Date(), lastRevealedById: ctx.userId } });
  await audit({ action: "vault.reveal", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "client_credential", resourceId: id, metadata: { system: row.system }, meta: ctx.meta });
  return { login: s.login, password: s.password, notes: s.notes, system: row.system, label: row.label };
}
