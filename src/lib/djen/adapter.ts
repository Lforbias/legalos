import { cnjFromDigits, kindFromSource, KIND_LABEL } from "@/lib/judicial/communication";
import { getConnector } from "@/lib/judicial/catalog";
import type { NormalizedCommunication, NoticeQuery, NoticeSourceAdapter, OperationFailure } from "@/lib/judicial/contracts";
import { checkDjenAvailability, defaultHttp, DjenError, fetchDjenPage, type DjenHttp, type DjenItem } from "./client";

/** Item do DJEN → comunicação normalizada. A origem é SEMPRE publicação do DJEN (nunca intimação privada). */
export function normalizeDjenItem(it: DjenItem): NormalizedCommunication {
  const kind = kindFromSource(it.tipoDocumento, it.tipoComunicacao);
  const cnj = cnjFromDigits(it.numeroProcesso);
  return {
    origin: "DJEN_PUBLICATION",
    sourceSystem: "djen",
    officialId: it.id,
    courtCode: it.tribunal ? it.tribunal.slice(0, 20) : null,
    cnj,
    kind,
    title: `${KIND_LABEL[kind]} (DJEN)${cnj ? ` — processo ${cnj}` : ""}`.slice(0, 200),
    content: it.texto,
    publishedOn: it.disponibilizadoEm,
    orgao: it.orgao,
    classe: it.classe,
    link: it.link,
    cancelled: it.cancelada,
    rawHash: it.rawHash,
  };
}

const fail = (e: unknown): OperationFailure => {
  if (e instanceof DjenError) return { ok: false, code: e.code, message: e.message, retryable: e.retryable, ...(e.retryAfterSec ? { retryAfterSec: e.retryAfterSec } : {}) };
  return { ok: false, code: "INTERNAL", message: "Falha inesperada ao consultar o DJEN.", retryable: true };
};

/** Adaptador do DJEN no contrato do motor. Só implementa o que o catálogo declara: checkAvailability e listNotices. */
export function createDjenAdapter(http: DjenHttp = defaultHttp, opts: { pauseMs?: number } = {}): NoticeSourceAdapter {
  const descriptor = getConnector("djen")!;
  return {
    descriptor,
    async checkAvailability(probe) {
      const today = new Date().toISOString().slice(0, 10);
      try {
        // Consulta mínima (1 item, 1 dia) com a PRÓPRIA identidade monitorada: valida o serviço e o formato da resposta.
        const r = await checkDjenAvailability({ numeroOab: probe.oabNumber, ufOab: probe.oabUf, inicio: today, fim: today }, http);
        return { ok: true, latencyMs: r.latencyMs, detail: "O serviço respondeu à consulta com o formato esperado." };
      } catch (e) {
        return fail(e);
      }
    },
    async listNotices(q: NoticeQuery) {
      try {
        const p = await fetchDjenPage({ numeroOab: q.oabNumber, ufOab: q.oabUf, inicio: q.from, fim: q.to, ...(q.courtCode ? { siglaTribunal: q.courtCode } : {}) }, q.page, http, { pauseMs: opts.pauseMs, pageSize: q.pageSize });
        return { ok: true, items: p.items.map(normalizeDjenItem), unparsed: p.skipped, rawCount: p.rawCount, reportedTotal: p.reportedTotal, hasMore: p.hasMore };
      } catch (e) {
        return fail(e);
      }
    },
  };
}
