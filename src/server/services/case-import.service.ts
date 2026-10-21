import { z } from "zod";
import { db } from "@/lib/db/client";
import { fetchDatajud, type DatajudResult } from "@/lib/datajud/client";
import { IMPORT_MAX, parseNumberList } from "@/lib/case-import";
import { NotFoundError, ValidationError } from "@/lib/permissions/check";
import { assertCan, can, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { createCase } from "./case.service";
import { datajudStatus, syncCaseFromDatajud } from "./datajud.service";
import { connectionForCase, importAutosMni, type SoapPost } from "./mni.service";

/**
 * 3.0-F4 — importação de processos em lote por número CNJ. A criação dos processos é imediata e sempre vale por item
 * (um número ruim não derruba os outros). Consulta ao DataJud e download de autos pelo MNI rodam em pequenos passos
 * (`processBatchStep`), que a tela chama em sequência e que podem ser retomados a qualquer momento.
 */

export const batchInputSchema = z.object({
  numbers: z.string().max(20_000, "Texto muito grande."),
  clientId: z.string().refine((v) => v === "" || z.uuid().safeParse(v).success, "Cliente inválido."),
  clientRole: z.enum(["PLAINTIFF", "DEFENDANT", "THIRD_PARTY", "OTHER"]),
  datajud: z.boolean(),
  autos: z.boolean(),
  updateExisting: z.boolean(),
});
export type BatchInput = z.infer<typeof batchInputSchema>;

const emptyCase = { legacyNumber: "", area: "", court: "", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "" };

export async function createImportBatch(ctx: TenantContext, raw: BatchInput) {
  assertCan(ctx, "cases:write");
  const input = batchInputSchema.parse(raw);
  if (input.autos) assertCan(ctx, "documents:write");
  const parsed = parseNumberList(input.numbers);
  if (parsed.length === 0) throw new ValidationError("Cole ao menos um número.", { numbers: ["Cole ao menos um número CNJ."] });
  if (parsed.length > IMPORT_MAX) throw new ValidationError(`No máximo ${IMPORT_MAX} números por vez.`, { numbers: [`Você colou ${parsed.length}; o limite é ${IMPORT_MAX} por vez.`] });

  const dj = input.datajud ? await datajudStatus(ctx) : null;
  const batch = await db.caseImportBatch.create({
    data: { organizationId: ctx.organizationId, createdById: ctx.userId, options: { datajud: input.datajud, autos: input.autos, updateExisting: input.updateExisting } },
    select: { id: true },
  });

  const existing = await db.case.findMany({
    where: { organizationId: ctx.organizationId, deletedAt: null, number: { in: parsed.filter((p) => p.number).map((p) => p.number as string) } },
    select: { id: true, number: true },
  });
  const byNumber = new Map(existing.map((c) => [c.number, c.id]));

  let created = 0;
  for (const [i, p] of parsed.entries()) {
    let createStatus = "INVALID";
    let caseId: string | null = null;
    let message = p.message;
    if (p.status === "DUPLICATE") createStatus = "DUPLICATE";
    else if (p.status === "OK" && p.number) {
      const found = byNumber.get(p.number);
      if (found) {
        createStatus = "EXISTS";
        caseId = found;
        message = "Já cadastrado neste escritório.";
      } else {
        try {
          const c = await createCase(ctx, { ...emptyCase, number: p.number, title: `Processo ${p.number}`, clientId: input.clientId, clientRole: input.clientRole });
          createStatus = "CREATED";
          caseId = c.id;
          created++;
        } catch (err) {
          createStatus = "FAILED";
          message = err instanceof Error ? err.message.slice(0, 200) : "Falha ao cadastrar.";
        }
      }
    }
    const eligible = caseId !== null && (createStatus === "CREATED" || (createStatus === "EXISTS" && input.updateExisting));
    const djOk = eligible && input.datajud && Boolean(dj?.keyConfigured && dj.orgEnabled);
    await db.caseImportItem.create({
      data: {
        organizationId: ctx.organizationId,
        batchId: batch.id,
        position: i,
        raw: p.raw.slice(0, 60),
        number: p.number,
        createStatus,
        caseId,
        message,
        syncStatus: !input.datajud ? "NONE" : djOk ? "PENDING" : "SKIPPED",
        syncMessage: input.datajud && !djOk ? (eligible ? "DataJud desligado ou sem chave neste escritório." : null) : null,
        autosStatus: input.autos && eligible ? "PENDING" : "NONE",
      },
    });
  }
  await audit({ action: "case.import_batch", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case_import", resourceId: batch.id, metadata: { total: parsed.length, created }, meta: ctx.meta });
  return { id: batch.id, total: parsed.length, created };
}

export async function getImportBatch(ctx: TenantContext, id: string) {
  assertCan(ctx, "cases:read");
  const b = await db.caseImportBatch.findFirst({
    where: { id, organizationId: ctx.organizationId },
    include: { items: { orderBy: { position: "asc" }, take: 500 } },
  });
  if (!b) throw new NotFoundError("Lote não encontrado.");
  const items = b.items;
  const count = (f: (i: (typeof items)[number]) => boolean) => items.filter(f).length;
  const pending = count((i) => i.syncStatus === "PENDING" || i.autosStatus === "PENDING" || i.autosStatus === "PARTIAL");
  return {
    id: b.id,
    createdAt: b.createdAt,
    options: b.options as { datajud?: boolean; autos?: boolean; updateExisting?: boolean },
    items,
    totals: {
      total: items.length,
      created: count((i) => i.createStatus === "CREATED"),
      exists: count((i) => i.createStatus === "EXISTS"),
      invalid: count((i) => i.createStatus === "INVALID"),
      duplicate: count((i) => i.createStatus === "DUPLICATE"),
      failed: count((i) => i.createStatus === "FAILED"),
      pending,
    },
  };
}

export async function listImportBatches(ctx: TenantContext) {
  assertCan(ctx, "cases:read");
  return db.caseImportBatch.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, createdAt: true, _count: { select: { items: true } } } });
}

type Deps = { fetcher?: (cnj: string) => Promise<DatajudResult>; post?: SoapPost };

/**
 * Um passo: até 5 consultas ao DataJud e 2 downloads de autos (MNI). Cada item falha sozinho, com a mensagem anotada.
 * Devolve quantos itens ainda esperam trabalho; a tela repete até zerar. Pode ser chamado de novo a qualquer momento.
 */
export async function processBatchStep(ctx: TenantContext, batchId: string, deps: Deps = {}) {
  assertCan(ctx, "cases:write");
  const batch = await db.caseImportBatch.findFirst({ where: { id: batchId, organizationId: ctx.organizationId }, select: { id: true } });
  if (!batch) throw new NotFoundError("Lote não encontrado.");

  const syncItems = await db.caseImportItem.findMany({ where: { batchId, syncStatus: "PENDING" }, orderBy: { position: "asc" }, take: 5 });
  for (const it of syncItems) {
    try {
      const r = await syncCaseFromDatajud(ctx, it.caseId!, deps.fetcher ?? fetchDatajud);
      await db.caseImportItem.update({ where: { id: it.id }, data: r.found ? { syncStatus: "OK", syncMessage: `${r.imported} andamento(s) novo(s) de ${r.total}.` } : { syncStatus: "OK", syncMessage: "Não encontrado no DataJud (pode ser sigiloso ou ainda não indexado)." } });
    } catch (err) {
      await db.caseImportItem.update({ where: { id: it.id }, data: { syncStatus: "FAILED", syncMessage: msg(err) } });
    }
  }

  if (can(ctx, "documents:write")) {
    const autosItems = await db.caseImportItem.findMany({ where: { batchId, autosStatus: { in: ["PENDING", "PARTIAL"] } }, orderBy: { position: "asc" }, take: 2 });
    for (const it of autosItems) {
      try {
        if (!(await connectionForCase(ctx, it.caseId!))) {
          await db.caseImportItem.update({ where: { id: it.id }, data: { autosStatus: "SKIPPED", autosMessage: "Sem conexão PJe/MNI ativa para este tribunal." } });
          continue;
        }
        const r = await importAutosMni(ctx, it.caseId!, deps.post);
        await db.caseImportItem.update({
          where: { id: it.id },
          // sem progresso (ex.: só restam documentos que não podem ser baixados) = encerra, para não repetir sem fim
          data: { autosStatus: r.remaining > 0 && r.imported > 0 ? "PARTIAL" : "OK", autosMessage: `${r.imported} documento(s) baixado(s)${r.remaining > 0 ? `; ${r.imported > 0 ? "faltam" : "não foi possível baixar"} ${r.remaining}` : ""}.` },
        });
      } catch (err) {
        await db.caseImportItem.update({ where: { id: it.id }, data: { autosStatus: "FAILED", autosMessage: msg(err) } });
      }
    }
  }
  const remaining = await db.caseImportItem.count({ where: { batchId, OR: [{ syncStatus: "PENDING" }, { autosStatus: { in: ["PENDING", "PARTIAL"] } }] } });
  return { remaining };
}

const msg = (err: unknown) => (err instanceof Error ? err.message : "Falha desconhecida.").slice(0, 200);
