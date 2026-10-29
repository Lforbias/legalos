import { db } from "@/lib/db/client";
import { todayYmd } from "@/lib/dates/ymd";
import { portalNoticeBatchSchema, portalObservationKey } from "@/lib/pje/portal-import";
import { assertCan, type TenantContext } from "@/server/context";
import { createNotice } from "./notice.service";
import { isUniqueViolation } from "./db-errors";
import { audit } from "./audit.service";

/** Import only the reviewed list metadata. No request is ever made to a tribunal. */
export async function importPortalNotices(ctx: TenantContext, raw: unknown) {
  assertCan(ctx, "inbox:write");
  const batch = portalNoticeBatchSchema.parse(raw);
  let created = 0, known = 0;
  for (const item of batch.items) {
    const externalKey = portalObservationKey(item);
    // Do not return record IDs: an existing notice may belong to a confidential case.
    if (await db.courtNotice.count({ where: { organizationId: ctx.organizationId, externalKey } })) { known++; continue; }
    try {
      await createNotice(ctx, {
        source: "MANUAL", kind: "OUTRO", title: `PJe TRF3 — ${item.title}`,
        content: `METADADOS OBSERVADOS NA LISTA DO PJe/TRF3 — 1º grau\nProcesso: ${item.caseNumber}\nReferência exibida: ${item.title} (${item.reference})\nComunicação informada pelo portal: ${item.communicatedAt}\nOrigem: ${batch.sourceOrigin}${batch.sourcePath}\n\nCaptura assistida confirmada pela pessoa. Não contém o teor da intimação. A referência exibida não foi validada como identificador oficial do expediente. Não registra ciência, não calcula prazo e não comprova monitoramento automático.`,
        caseNumber: item.caseNumber, court: "TRF3 — 1º grau", publishedAt: "", receivedAt: todayYmd(ctx.timezone), caseId: "",
      }, { source: "IMPORTED", externalKey, capture: { originKind: "IMPORT", officialId: null, sourceSystem: "pje-portal-assisted", courtCode: "TRF3", capturedAt: new Date(), evidence: { assisted: true, metadataOnly: true, actorId: ctx.userId } } });
      created++;
    } catch (e) {
      if (isUniqueViolation(e) && await db.courtNotice.count({ where: { organizationId: ctx.organizationId, externalKey } })) known++;
      else throw e;
    }
  }
  await audit({ action: "portal.notices.import", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_notice", metadata: { source: "trf3-1g", created, known, assisted: true }, meta: ctx.meta });
  return { created, known, received: batch.items.length };
}
