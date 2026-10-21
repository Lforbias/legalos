import { db } from "@/lib/db/client";
import { datajudAlias, datajudApiKey, fetchDatajud, movementKey, type DatajudResult } from "@/lib/datajud/client";
import { ConflictError, ValidationError } from "@/lib/permissions/check";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { assertCaseVisible } from "./case.service";

export type DatajudStatus = { keyConfigured: boolean; orgEnabled: boolean };
export type DatajudSyncResult = { alias: string; found: boolean; total: number; imported: number; classe: string | null; orgaoJulgador: string | null };

export async function datajudStatus(ctx: TenantContext): Promise<DatajudStatus> {
  assertCan(ctx, "cases:read");
  const org = await db.organization.findUnique({ where: { id: ctx.organizationId }, select: { datajudEnabled: true } });
  return { keyConfigured: Boolean(datajudApiKey()), orgEnabled: Boolean(org?.datajudEnabled) };
}

/** Liga/desliga a consulta ao DataJud (o número do processo é enviado ao CNJ). Exige `integrations:manage`. */
export async function setOrgDatajudEnabled(ctx: TenantContext, enabled: boolean) {
  assertCan(ctx, "integrations:manage");
  await db.organization.update({ where: { id: ctx.organizationId }, data: { datajudEnabled: enabled } });
  await audit({ action: enabled ? "datajud.enable" : "datajud.disable", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "organization", resourceId: ctx.organizationId, meta: ctx.meta });
}

/** Busca os andamentos públicos no DataJud e importa só os novos (idempotente). Processos sigilosos nunca são consultados. */
export async function syncCaseFromDatajud(ctx: TenantContext, caseId: string, fetcher: (cnj: string) => Promise<DatajudResult> = fetchDatajud): Promise<DatajudSyncResult> {
  assertCan(ctx, "cases:write");
  await assertCaseVisible(ctx, caseId);
  const org = await db.organization.findUnique({ where: { id: ctx.organizationId }, select: { datajudEnabled: true } });
  if (!org?.datajudEnabled) throw new ConflictError("A consulta ao DataJud está desligada neste escritório.");
  if (!datajudApiKey()) throw new ConflictError("A consulta ao DataJud não está configurada neste sistema (falta DATAJUD_API_KEY).");
  const c = await db.case.findFirstOrThrow({ where: { id: caseId, organizationId: ctx.organizationId }, select: { number: true, confidential: true } });
  if (c.confidential) throw new ValidationError("Processos sigilosos não são consultados em serviços externos.");
  if (!c.number) throw new ValidationError("Informe o número CNJ do processo para consultar o DataJud.");
  if (!datajudAlias(c.number)) throw new ValidationError("Este tribunal não é coberto pelo DataJud.");

  const r = await fetcher(c.number);
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
