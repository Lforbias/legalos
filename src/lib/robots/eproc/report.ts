import type { Page } from "playwright-core";
import { pageSerializable } from "../pje/signature";

const TJMG_REPORT_ORIGIN = "https://eproc1g.tjmg.jus.br";
const TJMG_REPORT_PATH = "/eproc/controlador.php";
const TJMG_REPORT_ACTION = "relatorio_processo_procurador_listar";
export const TJMG_REPORT_LABELS = ["Relação de Processos", "Últimas Movimentações"] as const;

/** Seleciona a rota confirmada usando o link emitido na sessão atual do eproc. */
export async function getTjmgReportLink(page: Page, label: typeof TJMG_REPORT_LABELS[number] = "Relação de Processos"): Promise<string | null> {
  if (new URL(page.url()).origin !== TJMG_REPORT_ORIGIN) return null;
  return page.evaluate(pageSerializable(function findReport({ origin, path, action, label }: { origin: string; path: string; action: string; label: string }) {
    if (location.origin !== origin) return null;
    for (const link of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      if (!link.getClientRects().length || link.innerText.replace(/\s+/g, " ").trim().toLowerCase() !== label.toLowerCase()) continue;
      const url = new URL(link.href);
      const actions = url.searchParams.getAll("acao");
      if (url.origin === origin && url.pathname === path && !url.username && !url.password && actions.length === 1 && actions[0] === action) {
        return url.href;
      }
    }
    return null;
  }), { origin: TJMG_REPORT_ORIGIN, path: TJMG_REPORT_PATH, action: TJMG_REPORT_ACTION, label });
}

export async function readTjmgReport(page: Page, href: string) {
  const expected = new URL(href);
  if (expected.origin !== TJMG_REPORT_ORIGIN || expected.pathname !== TJMG_REPORT_PATH ||
    expected.searchParams.get("acao") !== TJMG_REPORT_ACTION) return null;
  const report = await page.context().newPage();
  try {
    const response = await report.goto(href, { waitUntil: "domcontentloaded", timeout: 15_000 });
    const current = new URL(report.url());
    if (!response?.ok() || current.origin !== expected.origin || current.pathname !== expected.pathname ||
      current.searchParams.get("acao") !== TJMG_REPORT_ACTION) return null;
    return await report.evaluate(pageSerializable(collectEprocReport));
  } finally {
    await report.close().catch(() => undefined);
  }
}

export type EprocReportRow = {
  processNumber: string;
  event: string | null;
  eventDate: string | null;
};

/** Lê somente as células visíveis da tabela do relatório. Pode ser executada no contexto do navegador. */
export function collectEprocReport(): { rows: EprocReportRow[]; truncated: boolean; recognized: boolean } {
  const rows: EprocReportRow[] = [];
  const limit = 200;
  let recognized = false;

  function normalize(value: string) {
    return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function content(cell: HTMLTableCellElement | undefined, limit: number) {
    return cell && cell.getClientRects().length
      ? cell.innerText.replace(/\s+/g, " ").trim().slice(0, limit) || null
      : null;
  }

  for (const table of document.querySelectorAll("table")) {
    if (!table.getClientRects().length) continue;
    const header = table.tHead?.rows[0] ?? table.rows[0];
    if (!header || [...header.cells].some((cell) => cell.colSpan !== 1 || cell.rowSpan !== 1)) continue;
    const columns = [...header.cells].map((cell) => normalize(cell.innerText));
    const process = columns.findIndex((label) => /^(?:(?:n[º°o.]|numero) (?:do )?)?processo$/.test(label));
    if (process < 0) continue;
    recognized = true;
    const event = columns.findIndex((label) => /^(?:evento(?: de intimacao)?|(?:ultima )?movimentacao|ultimo evento)$/.test(label));
    const date = columns.findIndex((label) => /^(?:data(?: do evento| da movimentacao| de intimacao)?|data\/hora(?: (?:ult\.?|ultimo) evento)?)$/.test(label));
    for (const body of table.tBodies) {
      for (const row of body.rows) {
        if (row === header || !row.getClientRects().length || row.cells.length !== columns.length) continue;
        const processNumber = content(row.cells[process], 80)
          ?.match(/\b\d{7}-\s*\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/)?.[0]
          ?.replace(/\s+/g, "");
        if (!processNumber) continue;
        if (rows.length === limit) return { rows, truncated: true, recognized };
        rows.push({ processNumber, event: content(row.cells[event], 400), eventDate: content(row.cells[date], 40) });
      }
    }
  }
  return { rows, truncated: false, recognized };
}
