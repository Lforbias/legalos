import { XMLParser } from "fast-xml-parser";

/**
 * Cliente do MNI (Modelo Nacional de Interoperabilidade, CNJ) — serviço de intercomunicação 2.2.x.
 * ATENÇÃO: montado a partir do padrão público do CNJ e testado contra respostas SIMULADAS. Cada tribunal
 * tem particularidades (endereço, autenticação, campos opcionais); valide com o seu tribunal antes de confiar.
 */
export const MNI_SERVICE_NS = "http://www.cnj.jus.br/servico-intercomunicacao-2.2.2/";

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

export type MniCredentials = { document: string; password: string };

function envelope(operation: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tns="${MNI_SERVICE_NS}"${["consultarProcesso", "consultarAvisosPendentes"].includes(operation) ? ' xmlns="http://www.cnj.jus.br/tipos-servico-intercomunicacao-2.2.2"' : ""}><soapenv:Header/><soapenv:Body><tns:${operation}>${body}</tns:${operation}></soapenv:Body></soapenv:Envelope>`;
}
const tag = (name: string, v: string | boolean) => `<${name}>${esc(String(v))}</${name}>`;

export function buildConsultarAvisosPendentes(c: MniCredentials): string {
  return envelope("consultarAvisosPendentes", tag("idConsultante", c.document) + tag("senhaConsultante", c.password));
}

/**
 * `cnjDigits`: 20 dígitos, sem máscara. Por padrão não pede o conteúdo dos documentos.
 * `documentIds`: pede o conteúdo só desses documentos (lotes pequenos, para respeitar o limite de resposta).
 */
export function buildConsultarProcesso(c: MniCredentials, cnjDigits: string, opts: { documentIds?: string[]; movimentos?: boolean } = {}): string {
  const ids = (opts.documentIds ?? []).map((id) => tag("documento", id)).join("");
  return envelope(
    "consultarProcesso",
    tag("idConsultante", c.document) + tag("senhaConsultante", c.password) + tag("numeroProcesso", cnjDigits) + tag("movimentos", opts.movimentos ?? true) + tag("incluirCabecalho", true) + tag("incluirDocumentos", false) + ids,
  );
}

export type MniManifestDoc = { tipoDocumento: string; mimetype: string; descricao: string; conteudo: Buffer; sigilo?: number };

/**
 * `entregarManifestacaoProcessual` (protocolo de petição). Atenção: o primeiro documento é a peça principal e os demais
 * são anexos. Muitos tribunais exigem ASSINATURA digital de cada documento; esta versão NÃO assina (ver docs).
 */
export function buildEntregarManifestacao(c: MniCredentials, cnjDigits: string, docs: MniManifestDoc[], sentAt: Date): string {
  const d = docs
    .map((x) => `<documento tipoDocumento="${esc(x.tipoDocumento)}" mimetype="${esc(x.mimetype)}" nivelSigilo="${x.sigilo ?? 0}" descricao="${esc(x.descricao)}"><conteudo>${x.conteudo.toString("base64")}</conteudo></documento>`)
    .join("");
  const stamp = new Date(sentAt.getTime() - 3 * 3600 * 1000).toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return envelope("entregarManifestacaoProcessual", tag("idManifestante", c.document) + tag("senhaManifestante", c.password) + tag("numeroProcesso", cnjDigits) + d + tag("dataEnvio", stamp));
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ["aviso", "movimento", "complemento", "polo", "parte", "assunto", "documento", "documentoVinculado"].includes(name),
});

export class MniError extends Error {}

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const asArr = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : v == null ? [] : [v as T]);
const attr = (o: Obj, k: string): string | null => {
  const v = o[`@_${k}`];
  return typeof v === "string" && v.trim() ? v.trim() : null;
};
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Abre o envelope SOAP, trata Fault e o par sucesso/mensagem do MNI e devolve o corpo da resposta. */
function openResponse(xml: string, responseTag: string): Obj {
  let doc: Obj;
  try {
    doc = asObj(parser.parse(xml));
  } catch {
    throw new MniError("Resposta do tribunal não é um XML válido.");
  }
  const body = asObj(asObj(doc["Envelope"])["Body"]);
  if (body["Fault"]) {
    const f = asObj(body["Fault"]);
    throw new MniError(`O tribunal recusou a requisição: ${text(f["faultstring"]) ?? "erro sem descrição"}`.slice(0, 300));
  }
  const resp = asObj(body[responseTag]);
  if (!Object.keys(resp).length) throw new MniError("Resposta do tribunal em formato inesperado.");
  const ok = text(resp["sucesso"]);
  if (ok !== null && ok.toLowerCase() !== "true") throw new MniError(`O tribunal respondeu sem sucesso: ${text(resp["mensagem"]) ?? "sem mensagem"}`.slice(0, 300));
  return resp;
}

/** `yyyyMMddHHmmss` (ou `yyyyMMdd`) do MNI → Date em UTC; o MNI não informa fuso, tratamos como horário de Brasília (UTC-3). */
export function parseMniDate(v: string | null): Date | null {
  if (!v) return null;
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h) + 3, Number(mi), Number(s)));
  return Number.isNaN(date.getTime()) ? null : date;
}

export type MniAviso = { idAviso: string; tipo: "INTIMACAO" | "CITACAO" | "OUTRO"; disponibilizadoEm: Date | null; numeroProcesso: string | null; classe: string | null };

function findProcesso(o: Obj): Obj {
  return asObj(o["processo"]);
}

export function parseAvisosPendentes(xml: string): MniAviso[] {
  const resp = openResponse(xml, "consultarAvisosPendentesResposta");
  const out: MniAviso[] = [];
  for (const a of asArr<Obj>(resp["aviso"])) {
    const id = attr(a, "idAviso") ?? text(asObj(a)["idAviso"]);
    if (!id) continue;
    const t = (attr(a, "tipoComunicacao") ?? "").toUpperCase();
    const proc = findProcesso(a);
    out.push({
      idAviso: id,
      tipo: t.startsWith("INT") ? "INTIMACAO" : t.startsWith("CIT") ? "CITACAO" : "OUTRO",
      disponibilizadoEm: parseMniDate(attr(a, "dataDisponibilizacao")),
      numeroProcesso: attr(proc, "numero") ?? attr(a, "numeroProcesso"),
      classe: attr(proc, "classeProcessual"),
    });
  }
  return out;
}

export type MniMovimento = { id: string | null; at: Date; codigoNacional: string | null; descricaoLocal: string | null; complementos: string[]; sigilo: number };
export type MniDocumento = { id: string; tipo: string | null; descricao: string | null; mimetype: string | null; at: Date | null; sigilo: number; content: Buffer | null };
export type MniProcesso = { numero: string | null; classe: string | null; orgao: string | null; sigilo: number; ajuizadoEm: Date | null; movimentos: MniMovimento[]; documentos: MniDocumento[] };

/** Documentos do processo (inclusive os vinculados, achatados). `content` só vem quando o tribunal enviou o conteúdo em base64. */
function parseDocumentos(proc: Obj): MniDocumento[] {
  const out: MniDocumento[] = [];
  const walk = (d: Obj, depth: number) => {
    const id = attr(d, "idDocumento");
    if (id) {
      const raw = text(d["conteudo"]);
      const b64 = raw ? raw.replace(/\s+/g, "") : null;
      out.push({
        id,
        tipo: attr(d, "tipoDocumento"),
        descricao: attr(d, "descricao"),
        mimetype: attr(d, "mimetype"),
        at: parseMniDate(attr(d, "dataHora")),
        sigilo: Number(attr(d, "nivelSigilo") ?? 0) || 0,
        content: b64 && /^[A-Za-z0-9+/]+={0,2}$/.test(b64) ? Buffer.from(b64, "base64") : null,
      });
    }
    if (depth < 3) for (const v of asArr<Obj>(d["documentoVinculado"])) walk(asObj(v), depth + 1);
  };
  for (const d of asArr<Obj>(proc["documento"])) walk(asObj(d), 0);
  return out;
}

export function parseConsultarProcesso(xml: string): MniProcesso {
  const resp = openResponse(xml, "consultarProcessoResposta");
  const proc = findProcesso(resp);
  const basicos = asObj(proc["dadosBasicos"]);
  const movimentos: MniMovimento[] = [];
  for (const m of [...asArr<Obj>(proc["movimento"]), ...asArr<Obj>(basicos["movimento"])]) {
    const at = parseMniDate(attr(m, "dataHora"));
    if (!at) continue;
    const nac = asObj(m["movimentoNacional"]);
    const loc = asObj(m["movimentoLocal"]);
    movimentos.push({
      id: attr(m, "identificadorMovimento"),
      at,
      codigoNacional: attr(nac, "codigoNacional") ?? attr(loc, "codigoPaiNacional"),
      descricaoLocal: attr(loc, "descricao"),
      complementos: asArr(m["complemento"]).map(text).filter((x): x is string => Boolean(x)),
      sigilo: Number(attr(m, "nivelSigilo") ?? 0) || 0,
    });
  }
  return {
    numero: attr(basicos, "numero") ?? attr(proc, "numero"),
    classe: attr(basicos, "classeProcessual"),
    orgao: attr(asObj(basicos["orgaoJulgador"]), "nomeOrgao"),
    sigilo: Number(attr(basicos, "nivelSigilo") ?? 0) || 0,
    ajuizadoEm: parseMniDate(attr(basicos, "dataAjuizamento")),
    movimentos,
    documentos: parseDocumentos(proc),
  };
}

export type MniManifestReceipt = { protocolo: string; dataOperacao: Date | null; recibo: string | null };

/** Só devolve sucesso se o tribunal informou um PROTOCOLO. Sem protocolo, nada é tratado como protocolado. */
export function parseEntregarManifestacao(xml: string): MniManifestReceipt {
  const resp = openResponse(xml, "entregarManifestacaoProcessualResposta");
  const protocolo = text(resp["protocoloRecebimento"]);
  if (!protocolo) throw new MniError("O tribunal respondeu sem número de protocolo; a petição NÃO deve ser considerada protocolada.");
  const rec = text(resp["recibo"]);
  let recibo: string | null = null;
  if (rec) {
    try {
      recibo = Buffer.from(rec, "base64").toString("utf8");
      if (/[\u0000-\u0008]/.test(recibo)) recibo = "Recibo binário (PDF) devolvido pelo tribunal; consulte-o no sistema do tribunal.";
    } catch {
      recibo = null;
    }
  }
  return { protocolo: protocolo.slice(0, 120), dataOperacao: parseMniDate(text(resp["dataOperacao"])), recibo: recibo ? recibo.slice(0, 4000) : null };
}
