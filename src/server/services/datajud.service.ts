import { BOX_AVAILABLE } from "@/lib/box-retirement";
import { assertBoxAvailable } from "@/server/box-guard";
import { z } from "zod";
import { mfaKey, encryptSecret, decryptSecret } from "@/lib/security/totp";
import { DatajudError, testDatajudKey } from "@/lib/datajud/client";
import { db } from "@/lib/db/client";
import { datajudAlias, datajudApiKey, fetchDatajud, movementKey, type DatajudResult } from "@/lib/datajud/client";
import { ConflictError, ValidationError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { assertCaseVisible } from "./case.service";

export type DatajudStatus = { keyConfigured: boolean; orgEnabled: boolean; ownKey: boolean; vaultAvailable: boolean; lastTest: { at: Date; ok: boolean; reason: string | null } | null };
export type DatajudSyncResult = { alias: string; found: boolean; total: number; imported: number; classe: string | null; orgaoJulgador: string | null };

export async function datajudStatus(ctx: TenantContext): Promise<DatajudStatus> {
  if (!BOX_AVAILABLE) return { keyConfigured: false, orgEnabled: false, ownKey: false, vaultAvailable: false, lastTest: null };
  assertCan(ctx, "cases:read");
  const org = await db.organization.findUnique({ where: { id: ctx.organizationId }, select: { datajudEnabled: true, datajudApiKeyEnc: true } });
  const check = await db.auditLog.findFirst({ where: { organizationId: ctx.organizationId, resourceId: ctx.organizationId, action: { in: ["datajud.connection_test", "datajud.connection_test_failed", "datajud.key_saved"] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { action: true, createdAt: true, metadata: true } });
  const reason = check?.metadata && typeof check.metadata === "object" && !Array.isArray(check.metadata) && typeof check.metadata.reason === "string" ? check.metadata.reason : null;
  return { keyConfigured: Boolean(org?.datajudApiKeyEnc || datajudApiKey()), orgEnabled: Boolean(org?.datajudEnabled), ownKey: Boolean(org?.datajudApiKeyEnc), vaultAvailable: Boolean(mfaKey()), lastTest: check && check.action !== "datajud.key_saved" ? { at: check.createdAt, ok: check.action === "datajud.connection_test", reason } : null };
}

/** Liga/desliga a consulta ao DataJud (o número do processo é enviado ao CNJ). Exige `integrations:manage`. */
export async function setOrgDatajudEnabled(ctx: TenantContext, enabled: boolean) {
  assertBoxAvailable();
  assertCan(ctx, "integrations:manage");
  await db.organization.update({ where: { id: ctx.organizationId }, data: { datajudEnabled: enabled } });
  await audit({ action: enabled ? "datajud.enable" : "datajud.disable", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "organization", resourceId: ctx.organizationId, meta: ctx.meta });
}

/** Busca os andamentos públicos no DataJud e importa só os novos (idempotente). Processos sigilosos nunca são consultados. */
export async function syncCaseFromDatajud(ctx: TenantContext, caseId: string, fetcher?: (cnj: string) => Promise<DatajudResult>): Promise<DatajudSyncResult> {
  assertBoxAvailable();
  assertCan(ctx, "cases:write");
  await assertCaseVisible(ctx, caseId);
  const org = await db.organization.findUnique({ where: { id: ctx.organizationId }, select: { datajudEnabled: true, datajudApiKeyEnc: true } });
  if (!org?.datajudEnabled) throw new ConflictError("A consulta ao DataJud está desligada neste escritório.");
  const key = await orgDatajudKey(ctx);
  if (!key) throw new ConflictError("Cadastre a chave do DataJud em Integrações ou configure DATAJUD_API_KEY no servidor.");
  const c = await db.case.findFirstOrThrow({ where: { id: caseId, organizationId: ctx.organizationId }, select: { number: true, confidential: true } });
  if (c.confidential) throw new ValidationError("Processos sigilosos não são consultados em serviços externos.");
  if (!c.number) throw new ValidationError("Informe o número CNJ do processo para consultar o DataJud.");
  if (!datajudAlias(c.number)) throw new ValidationError("Este tribunal não é coberto pelo DataJud.");

  let r: DatajudResult;
  try { r = await (fetcher ? fetcher(c.number) : fetchDatajud(c.number, key)); }
  catch (e) {
    if (!(e instanceof DatajudError)) throw e;
    await audit({ action: "datajud.sync_failed", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: caseId, metadata: { reason: e.code }, meta: ctx.meta });
    throw new ConflictError(e.message);
  }
  let imported = 0;
  if (r.found && r.movements.length) {
    const rows = r.movements.map((m) => ({
      organizationId: ctx.organizationId,
      caseId,
      source: "IMPORTED" as const,
      kind: "DATAJUD_MOVEMENT",
      title: m.name,
      description: m.complements.length ? m.complements.join("; ") : null,
      occurredAt: m.at,
      externalKey: movementKey(m),
      createdById: ctx.userId,
    }));
    const res = await db.caseEvent.createMany({ data: rows, skipDuplicates: true });
    imported = res.count;
  }
  await db.case.update({ where: { id: caseId }, data: { datajudSyncedAt: new Date() } });
  await audit({ action: "datajud.sync", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: caseId, metadata: { alias: r.alias, found: r.found, imported }, meta: ctx.meta });
  return { alias: r.alias, found: r.found, total: r.movements.length, imported, classe: r.classe, orgaoJulgador: r.orgaoJulgador };
}

/** Uso exclusivamente no servidor; a chave nunca é devolvida ao navegador. */
async function orgDatajudKey(ctx: TenantContext): Promise<string | null> {
  const org = await db.organization.findUnique({ where: { id: ctx.organizationId }, select: { datajudApiKeyEnc: true } });
  if (!org?.datajudApiKeyEnc) return datajudApiKey();
  const k = mfaKey();
  if (!k) throw new ConflictError("A cifra de configurações não está disponível neste servidor.");
  try { return decryptSecret(org.datajudApiKeyEnc, k); }
  catch { throw new ConflictError("Não foi possível abrir a chave do DataJud. Cadastre-a novamente ou confira a chave de cifra do servidor."); }
}
export async function saveOrgDatajudKey(ctx: TenantContext, raw: unknown) {
  assertBoxAvailable();
  assertCan(ctx, "integrations:manage");
  const key = z.string().trim().max(600).parse(raw).replace(/^Authorization:\s*/i, "").replace(/^APIKey\s+/i, "").trim();
  if (!/^[A-Za-z0-9+/_=-]{16,512}$/.test(key)) throw new ValidationError("Informe apenas a chave pública do DataJud, sem espaços.");
  const k = mfaKey();
  if (!k) throw new ConflictError("A cifra de configurações não está disponível neste servidor.");
  await db.$transaction(async tx => {
    await tx.organization.update({ where: { id: ctx.organizationId }, data: { datajudApiKeyEnc: encryptSecret(key, k) } });
    await audit({ action: "datajud.key_saved", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "organization", resourceId: ctx.organizationId, meta: ctx.meta }, tx);
  });
}
export async function testOrgDatajud(ctx: TenantContext, test: (key: string) => Promise<void> = testDatajudKey) {
  assertBoxAvailable();
  assertCan(ctx, "integrations:manage");
  const key = await orgDatajudKey(ctx);
  if (!key) throw new ConflictError("Cadastre uma chave do DataJud antes de testar.");
  try { await test(key); }
  catch (e) {
    if (!(e instanceof DatajudError)) throw e;
    await audit({ action: "datajud.connection_test_failed", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "organization", resourceId: ctx.organizationId, metadata: { reason: e.code }, meta: ctx.meta });
    throw new ConflictError(e.message);
  }
  await audit({ action: "datajud.connection_test", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "organization", resourceId: ctx.organizationId, meta: ctx.meta });
}
