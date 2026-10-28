import { z } from "zod";
import { db } from "@/lib/db/client";
import { ConflictError, NotFoundError } from "@/lib/permissions/check";
import { formatCnj, isValidCnj } from "@/lib/validation/br-documents";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { caseVisibility, createCase, getCase, updateCase } from "./case.service";

export const discoveryBatchSchema = z.object({
  sourceOrigin: z.string().max(180).refine(raw => { try { const u = new URL(raw); return u.protocol === "https:" && u.hostname.endsWith(".jus.br") && u.origin === raw && !u.port; } catch { return false; } }, "Use somente a origem HTTPS do tribunal .jus.br, sem caminho nem parâmetros."),
  numbers: z.array(z.string().max(30).refine(isValidCnj, "Número CNJ inválido.")).min(1).max(50),
}).strict();
const own = (ctx: TenantContext) => ({ organizationId: ctx.organizationId, userId: ctx.userId });

/** Browser observations are untrusted candidates, never proof of distribution or authority to link. */
export async function receivePjeDiscoveries(ctx: TenantContext, raw: unknown) {
  assertCan(ctx, "cases:write");
  const input = discoveryBatchSchema.parse(raw);
  const numbers = [...new Set(input.numbers.map(formatCnj))];
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pje-inbox:${ctx.organizationId}:${ctx.userId}`}))`;
    const existing = await tx.pjeDiscovery.findMany({ where: { ...own(ctx), number: { in: numbers } }, select: { number: true } });
    const known = new Set(existing.map(x => x.number));
    const fresh = numbers.filter(number => !known.has(number));
    if (await tx.pjeDiscovery.count({ where: { ...own(ctx), status: "PENDING" } }) + fresh.length > 1000) throw new ConflictError("Confira a fila de processos detectados antes de receber novos registros (limite de 1.000 pendentes).");
    if (fresh.length) {
      await tx.pjeDiscovery.createMany({ data: fresh.map(number => ({ ...own(ctx), number, sourceOrigin: input.sourceOrigin })), skipDuplicates: true });
      await audit({ action: "pje.discovery.receive", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "pje_discovery", metadata: { count: fresh.length, sourceOrigin: input.sourceOrigin }, meta: ctx.meta }, tx);
    }
  });
  // Never reveal whether an inaccessible/confidential case already exists.
  return { received: numbers.length };
}
export async function listPjeDiscoveries(ctx: TenantContext) {
  assertCan(ctx, "cases:read");
  return db.pjeDiscovery.findMany({ where: { ...own(ctx), status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, number: true, sourceOrigin: true, createdAt: true } });
}
export async function ignorePjeDiscovery(ctx: TenantContext, id: string) {
  assertCan(ctx, "cases:write");
  const row = await db.pjeDiscovery.findFirst({ where: { id, ...own(ctx) }, select: { number: true } });
  if (!row) throw new NotFoundError("Registro não encontrado.");
  await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pje-link:${ctx.organizationId}:${row.number}`}))`;
    const changed = await tx.pjeDiscovery.updateMany({ where: { id, ...own(ctx), status: "PENDING" }, data: { status: "IGNORED" } });
    if (changed.count !== 1) throw new NotFoundError("Registro não encontrado ou já tratado.");
    await audit({ action: "pje.discovery.ignore", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "pje_discovery", resourceId: id, meta: ctx.meta }, tx);
  });
}
export const linkDiscoverySchema = z.object({ id: z.uuid(), caseId: z.union([z.uuid(), z.literal("")]).optional(), clientId: z.union([z.uuid(), z.literal("")]).optional(), title: z.string().trim().max(200).optional(), area: z.string().trim().max(60).optional() });
export async function linkPjeDiscovery(ctx: TenantContext, raw: unknown) {
  assertCan(ctx, "cases:write"); assertCan(ctx, "cases:read");
  const input = linkDiscoverySchema.parse(raw);
  const initial = await db.pjeDiscovery.findFirst({ where: { id: input.id, ...own(ctx) } });
  if (!initial) throw new NotFoundError("Registro não encontrado.");
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pje-link:${ctx.organizationId}:${initial.number}`}))`;
    const row = await tx.pjeDiscovery.findFirstOrThrow({ where: { id: input.id, ...own(ctx) } });
    if (row.status === "IGNORED") throw new ConflictError("Este registro foi ignorado.");
    if (row.status === "LINKED" && row.caseId) { await getCase(ctx, row.caseId); return { caseId: row.caseId }; }
    const existing = await tx.case.findFirst({ where: { organizationId: ctx.organizationId, number: row.number, deletedAt: null }, select: { id: true } });
    let caseId: string;
    if (existing) {
      if (!await tx.case.count({ where: { AND: [{ id: existing.id, organizationId: ctx.organizationId, deletedAt: null }, caseVisibility(ctx)] } })) throw new ConflictError("Não foi possível vincular este número. Peça a quem administra o escritório para conferir a carteira.");
      if (input.caseId && input.caseId !== existing.id) throw new ConflictError("Este CNJ já está em outro cadastro. Abra o processo existente para conferir o vínculo.");
      caseId = existing.id;
    } else if (input.caseId) {
      const c = await getCase(ctx, input.caseId);
      if (c.number && c.number !== row.number) throw new ConflictError("O caso escolhido já tem outro CNJ. Cadastre um processo separado ou escolha outro caso.");
      await updateCase(ctx, c.id, { nature: "JUDICIAL", departmentId: c.departmentId ?? "", number: row.number, legacyNumber: c.legacyNumber ?? "", title: c.title, area: c.area ?? "", court: c.court ?? "", courtUnit: c.courtUnit ?? "", courtState: c.courtState ?? "", subject: c.subject ?? "", claimValue: c.claimValue?.toFixed(2).replace(".", ",") ?? "", status: c.status, phase: c.phase ?? "", distributedAt: c.distributedAt?.toISOString().slice(0, 10) ?? "", confidential: c.confidential, notes: c.notes ?? "", responsibleId: "" });
      caseId = c.id;
    } else {
      if (!input.clientId) throw new ConflictError("Escolha o cliente ou um caso existente antes de confirmar.");
      const c = await createCase(ctx, { nature: "JUDICIAL", number: row.number, legacyNumber: "", title: input.title || `Processo ${row.number}`, area: input.area ?? "", court: "", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE", phase: "", distributedAt: "", confidential: true, notes: "Número observado no navegador. Metadados e vínculo conferidos pela pessoa que cadastrou; sem consulta automática aos autos.", responsibleId: "", clientId: input.clientId, clientRole: "OTHER" });
      caseId = c.id;
    }
    await tx.pjeDiscovery.update({ where: { id: row.id }, data: { status: "LINKED", caseId } });
    await audit({ action: "pje.discovery.link", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: caseId, metadata: { discoveryId: row.id }, meta: ctx.meta }, tx);
    return { caseId };
  }, { timeout: 30_000 });
}
