import type { NormalizedCommunication } from "@/lib/judicial/contracts";
import { sourceKeyOf } from "@/lib/judicial/communication";
import { db } from "@/lib/db/client";
import type { TenantContext } from "@/server/context";
import { isUniqueViolation } from "@/server/services/db-errors";
import { createNotice, type CaptureMeta } from "@/server/services/notice.service";

export type IngestOutcome = { outcome: "CREATED"; noticeId: string; duplicateContent: boolean; autoLinked: boolean } | { outcome: "KNOWN"; noticeId: string | null };

export type IngestOptions = {
  /** Dia em que o escritório recebeu (YYYY-MM-DD, no fuso do escritório). */
  receivedOn: string;
  /** Texto que identifica quem capturou (ex.: "OAB BA 12345"), usado no cabeçalho do conteúdo. */
  header: string;
  professionalId?: string | null;
  syncRunId?: string | null;
  capturedAt?: Date;
  evidence?: Record<string, unknown>;
};

/**
 * Porta única de entrada de comunicações capturadas automaticamente.
 *  - Idempotente por fonte + identificador oficial (chave `djen:<id>` etc.): reprocessar a mesma janela nunca duplica.
 *  - NÃO funde comunicações juridicamente distintas: publicação do DJEN e intimação privada têm chaves e origens diferentes.
 *  - Nunca dispara ciência/leitura oficial: apenas grava o que a fonte entregou.
 */
export async function ingestCommunication(ctx: TenantContext, c: NormalizedCommunication, o: IngestOptions): Promise<IngestOutcome> {
  const externalKey = sourceKeyOf(c.sourceSystem, c.officialId);
  const known = await db.courtNotice.findFirst({ where: { organizationId: ctx.organizationId, externalKey }, select: { id: true } });
  if (known) return { outcome: "KNOWN", noticeId: known.id };
  const capture: CaptureMeta = { originKind: c.origin, sourceSystem: c.sourceSystem, officialId: c.officialId, courtCode: c.courtCode, professionalId: o.professionalId ?? null, capturedAt: o.capturedAt ?? new Date(), syncRunId: o.syncRunId ?? null, evidence: { rawHash: c.rawHash, ...(o.evidence ?? {}) } };
  try {
    const created = await createNotice(
      ctx,
      {
        source: "MANUAL",
        kind: c.kind,
        title: c.title,
        content: (o.header + c.content).slice(0, 50_000),
        caseNumber: c.cnj ?? "",
        court: (c.courtCode ?? c.sourceSystem.toUpperCase()).slice(0, 120),
        publishedAt: c.publishedOn ?? "",
        receivedAt: o.receivedOn,
        caseId: "",
      },
      { source: "IMPORTED", externalKey, capture },
    );
    return { outcome: "CREATED", noticeId: created.id, duplicateContent: created.duplicate, autoLinked: created.autoLinked };
  } catch (e) {
    if (isUniqueViolation(e)) return { outcome: "KNOWN", noticeId: null };
    throw e;
  }
}
