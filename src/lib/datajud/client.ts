import { parseCnj } from "@/lib/validation/br-documents";

const UF = ["ac", "al", "ap", "am", "ba", "ce", "dft", "es", "go", "ma", "mt", "ms", "mg", "pa", "pb", "pr", "pe", "pi", "rj", "rn", "rs", "ro", "rr", "sc", "se", "sp", "to"];

/** Alias do índice público do DataJud a partir dos campos J e TR do número CNJ. Retorna null quando o tribunal não é coberto. */
export function datajudAlias(cnj: string): string | null {
  const p = parseCnj(cnj);
  if (!p) return null;
  const tr = Number(p.court);
  switch (p.segment) {
    case "3":
      return "stj";
    case "4":
      return tr >= 1 && tr <= 6 ? `trf${tr}` : null;
    case "5":
      return tr === 0 ? "tst" : tr >= 1 && tr <= 24 ? `trt${tr}` : null;
    case "6":
      return tr >= 1 && tr <= 27 ? `tre-${UF[tr - 1] === "dft" ? "df" : UF[tr - 1]}` : null;
    case "8":
      return tr >= 1 && tr <= 27 ? `tj${UF[tr - 1]}` : null;
    default:
      return null;
  }
}

export type DatajudMovement = { code: number | null; name: string; at: Date; complements: string[] };
export type DatajudResult = {
  alias: string;
  found: boolean;
  classe: string | null;
  orgaoJulgador: string | null;
  grau: string | null;
  assuntos: string[];
  ajuizadoEm: Date | null;
  movements: DatajudMovement[];
};

export type DatajudErrorCode = "TIMEOUT" | "NETWORK" | "AUTH" | "RATE_LIMIT" | "UNAVAILABLE" | "INVALID_RESPONSE" | "CONFIG";
export class DatajudError extends Error {
  constructor(message: string, readonly code: DatajudErrorCode = "CONFIG") { super(message); this.name = "DatajudError"; }
}
/** Só mensagens fixas: respostas do provedor e credenciais nunca chegam à interface/auditoria. */
async function requestDatajud(alias: string, key: string, body: object): Promise<unknown> {
  try {
    const res = await fetch(`${baseUrl()}/api_publica_${alias}/_search`, {
      method: "POST", headers: { "content-type": "application/json", authorization: `APIKey ${key}` },
      body: JSON.stringify(body), signal: AbortSignal.timeout(30_000), cache: "no-store",
    });
    if (res.status === 403) throw new DatajudError("O DataJud recusou o acesso à API. Confira a chave e as permissões de acesso do servidor.", "AUTH");
    if (res.status === 401) throw new DatajudError("O DataJud recusou a chave configurada. Confira a chave pública vigente do CNJ em Integrações.", "AUTH");
    if (res.status === 429) throw new DatajudError("O DataJud limitou as consultas. Aguarde alguns minutos antes de tentar novamente.", "RATE_LIMIT");
    if (!res.ok) throw new DatajudError(`O DataJud está indisponível para esta consulta (HTTP ${res.status}). Tente novamente mais tarde.`, "UNAVAILABLE");
    let json: unknown;
    try { json = await res.json(); }
    catch (e) {
      if (e instanceof Error && ["TimeoutError", "AbortError"].includes(e.name)) throw e;
      throw new DatajudError("O DataJud retornou uma resposta inválida. Nenhum andamento foi importado.", "INVALID_RESPONSE");
    }
    const data = json as { hits?: { hits?: unknown }; timed_out?: boolean; _shards?: { failed?: number } } | null;
    if (!data || !Array.isArray(data.hits?.hits)) throw new DatajudError("O DataJud retornou uma resposta inválida. Nenhum andamento foi importado.", "INVALID_RESPONSE");
    if (data.timed_out || (data._shards?.failed ?? 0) > 0) throw new DatajudError("O DataJud retornou dados incompletos. Tente novamente; a consulta não foi concluída.", "UNAVAILABLE");
    return json;
  } catch (e) {
    if (e instanceof DatajudError) throw e;
    if (e instanceof Error && ["TimeoutError", "AbortError"].includes(e.name)) throw new DatajudError("O DataJud não respondeu em até 30 segundos. Tente novamente mais tarde.", "TIMEOUT");
    throw new DatajudError("Não foi possível conectar ao DataJud. Confira a conexão do servidor com o CNJ e tente novamente.", "NETWORK");
  }
}

export function datajudApiKey(): string | null {
  const k = process.env.DATAJUD_API_KEY?.trim();
  return k ? k : null;
}
const baseUrl = () => (process.env.DATAJUD_BASE_URL?.trim() || "https://api-publica.datajud.cnj.jus.br").replace(/\/$/, "");

type Raw = { hits?: { hits?: { _source?: Record<string, unknown> }[] } };
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const toDate = (v: unknown): Date | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Interpreta a resposta da API (função pura, testável). */
export function parseDatajudResponse(alias: string, raw: unknown): DatajudResult {
  const src = (raw as Raw)?.hits?.hits?.[0]?._source;
  if (!src) return { alias, found: false, classe: null, orgaoJulgador: null, grau: null, assuntos: [], ajuizadoEm: null, movements: [] };
  const movs = Array.isArray(src.movimentos) ? (src.movimentos as Record<string, unknown>[]) : [];
  const movements: DatajudMovement[] = [];
  for (const m of movs) {
    const at = toDate(m.dataHora);
    const name = str(m.nome);
    if (!at || !name) continue;
    const comps = Array.isArray(m.complementosTabelados) ? (m.complementosTabelados as Record<string, unknown>[]).map((c) => str(c.nome) ?? str(c.descricao)).filter((x): x is string => Boolean(x)) : [];
    movements.push({ code: typeof m.codigo === "number" ? m.codigo : null, name, at, complements: comps });
  }
  const assuntos = Array.isArray(src.assuntos) ? (src.assuntos as Record<string, unknown>[]).map((a) => str(a.nome)).filter((x): x is string => Boolean(x)) : [];
  return {
    alias,
    found: true,
    classe: str((src.classe as Record<string, unknown> | undefined)?.nome),
    orgaoJulgador: str((src.orgaoJulgador as Record<string, unknown> | undefined)?.nome),
    grau: str(src.grau),
    assuntos,
    ajuizadoEm: toDate(src.dataAjuizamento),
    movements,
  };
}

/** Consulta um processo na API pública do DataJud. Envia SOMENTE o número do processo. Nunca registra a chave. */
export async function fetchDatajud(cnj: string, configuredKey?: string | null): Promise<DatajudResult> {
  const key = configuredKey ?? datajudApiKey();
  if (!key) throw new DatajudError("A consulta ao DataJud não está configurada neste sistema (falta DATAJUD_API_KEY).");
  const alias = datajudAlias(cnj);
  const p = parseCnj(cnj);
  if (!alias || !p) throw new DatajudError("Este tribunal não é coberto pelo DataJud (ramos Estadual, Federal, Trabalho, Eleitoral, STJ e TST).");
  const digits = `${p.sequence}${p.check}${p.year}${p.segment}${p.court}${p.origin}`;
  const json = await requestDatajud(alias, key, { size: 1, query: { match: { numeroProcesso: digits } } });
  return parseDatajudResponse(alias, json);
}

/** Chave estável do andamento, para importar sem duplicar. */
export function movementKey(m: DatajudMovement): string {
  return `datajud:${m.code ?? "x"}:${m.at.toISOString()}:${m.name.toLowerCase()}`.slice(0, 200);
}

/** Testa autenticação sem consultar dados de qualquer processo. */
export async function testDatajudKey(key: string): Promise<void> {
  await requestDatajud("tjsp", key, { size: 0, query: { match_none: {} } });
}
