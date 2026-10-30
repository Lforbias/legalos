/**
 * Sonda do DJEN (somente leitura): faz uma consulta PÚBLICA real por OAB e imprime só o FORMATO da resposta.
 *
 * Uso (rode num servidor NO BRASIL; o DJEN recusa acessos de fora):
 *   npm run djen:probe -- --oab 12345 --uf BA [--days 7] [--pages 5] [--tribunal TRF3]
 *
 * Não usa banco de dados, não grava nada e NÃO imprime texto de publicação, nomes de partes nem números de processo.
 * A "assinatura" final pode ser colada no chat: tem apenas contagens, nomes de campos e siglas de tribunal.
 */
import { DJEN_PAGE_SIZE, DjenError, defaultHttp, djenBase, djenFailureFor, fetchDjenPage, type DjenQuery } from "../src/lib/djen/client";
import { cnjFromDigits } from "../src/lib/judicial/communication";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const fail = (msg: string): never => {
  console.error(msg);
  process.exit(1);
};

const oab = (arg("oab") ?? "").replace(/\D/g, "").replace(/^0+/, "");
const uf = (arg("uf") ?? "").trim().toUpperCase();
const days = Math.min(30, Math.max(1, Number(arg("days") ?? 7) || 7));
const maxPages = Math.min(40, Math.max(1, Number(arg("pages") ?? 5) || 5));
const tribunal = arg("tribunal")?.trim().toUpperCase();
if (!/^[0-9]{1,7}$/.test(oab) || !/^[A-Z]{2}$/.test(uf)) fail("Uso: npm run djen:probe -- --oab 12345 --uf BA [--days 7] [--pages 5] [--tribunal TRF3]");

const ymdBr = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const fim = ymdBr(new Date());
const inicio = ymdBr(new Date(Date.now() - days * 86_400_000));
const q: DjenQuery = { numeroOab: oab, ufOab: uf, inicio, fim, ...(tribunal ? { siglaTribunal: tribunal } : {}) };

const bump = (m: Map<string, number>, k: string | null | undefined) => {
  const key = k && k.trim() ? k.trim().slice(0, 60) : "(vazio)";
  m.set(key, (m.get(key) ?? 0) + 1);
};
const top = (m: Map<string, number>, n = 12) => Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n));

async function main() {
  console.log(`DJEN real: ${djenBase()}`);
  console.log(`Consulta: OAB ${uf} ${oab}, de ${inicio} a ${fim}${tribunal ? `, tribunal ${tribunal}` : ""}.`);

  // 1) Resposta bruta da página 1: só nomes de campos e tipos, nunca valores.
  const params = new URLSearchParams({ numeroOab: oab, ufOab: uf, dataDisponibilizacaoInicio: inicio, dataDisponibilizacaoFim: fim, pagina: "1", itensPorPagina: String(DJEN_PAGE_SIZE) });
  if (tribunal) params.set("siglaTribunal", tribunal);
  const t0 = Date.now();
  const raw = await defaultHttp(`${djenBase()}/comunicacao?${params.toString()}`);
  const latencyMs = Date.now() - t0;
  console.log(`HTTP ${raw.status} em ${latencyMs} ms.`);
  if (raw.status < 200 || raw.status >= 300) {
    const e = djenFailureFor(raw.status, raw.body, raw.headers);
    console.error(`FALHOU (${e.code}): ${e.message}`);
    if (e.code === "GEO_BLOCKED") console.error("Dica: rode este comando no servidor do Brasil, não no seu computador fora do país.");
    process.exit(2);
  }
  let json: unknown;
  try {
    json = JSON.parse(raw.body);
  } catch {
    fail("A resposta não é JSON. O formato do DJEN mudou ou o endereço está errado.");
  }
  const top1 = typeof json === "object" && json !== null ? (json as Record<string, unknown>) : {};
  const items1 = Array.isArray(top1.items) ? (top1.items as unknown[]) : null;
  const fieldPresence = new Map<string, number>();
  const fieldTypes = new Map<string, string>();
  for (const it of items1 ?? []) {
    if (typeof it !== "object" || it === null) continue;
    for (const [k, v] of Object.entries(it as Record<string, unknown>)) {
      fieldPresence.set(k, (fieldPresence.get(k) ?? 0) + 1);
      if (!fieldTypes.has(k)) fieldTypes.set(k, Array.isArray(v) ? "array" : v === null ? "null" : typeof v);
    }
  }
  console.log(`Campos de topo: ${Object.keys(top1).join(", ") || "(nenhum)"}.`);
  if (!items1) fail("A resposta não traz a lista `items`. O formato do DJEN mudou.");

  // 2) Leitura página a página com o MESMO interpretador do sistema.
  const tipos = new Map<string, number>();
  const docs = new Map<string, number>();
  const tribunais = new Map<string, number>();
  let parsed = 0;
  let skipped = 0;
  let rawCount = 0;
  let cancelled = 0;
  let withCnj = 0;
  let withOabMatch = 0;
  let withLawyers = 0;
  let reportedTotal: number | null = null;
  let pagesRead = 0;
  let complete = false;
  let minDate: string | null = null;
  let maxDate: string | null = null;
  const ids = new Set<string>();
  let dupIds = 0;
  for (let page = 1; page <= maxPages; page++) {
    let p;
    try {
      p = await fetchDjenPage(q, page, defaultHttp, { pauseMs: 500 });
    } catch (e) {
      const err = e instanceof DjenError ? e : null;
      console.error(`Falha na página ${page}: ${err ? `${err.code} — ${err.message}` : "erro inesperado"}`);
      break;
    }
    pagesRead++;
    rawCount += p.rawCount;
    skipped += p.skipped;
    if (p.reportedTotal !== null) reportedTotal = p.reportedTotal;
    for (const it of p.items) {
      parsed++;
      if (ids.has(it.id)) dupIds++;
      ids.add(it.id);
      if (it.cancelada) cancelled++;
      if (cnjFromDigits(it.numeroProcesso)) withCnj++;
      if (it.lawyers.length) withLawyers++;
      if (it.lawyers.some((l) => (l.oab ?? "").replace(/\D/g, "").replace(/^0+/, "") === oab && (l.uf ?? "").toUpperCase() === uf)) withOabMatch++;
      bump(tipos, it.tipoComunicacao);
      bump(docs, it.tipoDocumento);
      bump(tribunais, it.tribunal);
      if (it.disponibilizadoEm) {
        if (!minDate || it.disponibilizadoEm < minDate) minDate = it.disponibilizadoEm;
        if (!maxDate || it.disponibilizadoEm > maxDate) maxDate = it.disponibilizadoEm;
      }
    }
    if (!p.hasMore) {
      complete = true;
      break;
    }
  }

  const countMatches = complete && reportedTotal !== null ? rawCount === reportedTotal : null;
  const signature = {
    quando: new Date().toISOString(),
    janela: { inicio, fim },
    http: raw.status,
    latenciaMs: latencyMs,
    camposDeTopo: Object.keys(top1),
    camposDosItens: Object.fromEntries([...fieldPresence.entries()].map(([k, n]) => [k, { emItens: n, tipo: fieldTypes.get(k) }])),
    paginas: { lidas: pagesRead, janelaCompleta: complete },
    itens: { brutos: rawCount, interpretados: parsed, naoInterpretados: skipped, idsRepetidos: dupIds, cancelados: cancelled },
    totalInformadoPelaFonte: reportedTotal,
    contagemConfere: countMatches,
    comNumeroCnjValido: withCnj,
    comAdvogadosListados: withLawyers,
    comAdvogadoIgualAOab: withOabMatch,
    datas: { primeira: minDate, ultima: maxDate },
    tiposDeComunicacao: top(tipos),
    tiposDeDocumento: top(docs),
    tribunais: top(tribunais),
  };

  console.log("");
  console.log(parsed ? `OK: ${parsed} comunicação(ões) interpretadas em ${pagesRead} página(s); ${skipped} não interpretadas.` : "A consulta funcionou, mas não há comunicações nessa janela para essa OAB.");
  if (countMatches === false) console.log(`ATENÇÃO: a fonte informou ${reportedTotal} e entregou ${rawCount}. O sistema trataria a janela como incompleta.`);
  if (!complete && pagesRead >= maxPages) console.log(`Parou em ${maxPages} páginas (limite da sonda); há mais resultados.`);
  console.log("");
  console.log("=== ASSINATURA (pode colar no chat; sem dados pessoais) ===");
  console.log(JSON.stringify(signature, null, 2));
  console.log("=== FIM ===");
}

main().catch((e) => {
  console.error("Falha inesperada na sonda:", e instanceof Error ? e.message : "erro desconhecido");
  process.exit(2);
});
