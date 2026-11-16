import type { Page } from "playwright-core";
import { pageSerializable } from "../pje/signature";
import { eprocAllowedOrigins, type EprocPortalTarget } from "./targets";

export type EprocPanelObservation = {
  host: string;
  path: string;
  sections: Array<{ label: string; count: number | null; path: string; queryKeys: string[] }>;
};

/** Roda no navegador autenticado e lê somente rótulos/contagens do painel; não abre processos ou comunicações. */
export function collectEprocPanel(): EprocPanelObservation {
  const PANEL_LABEL = /rela[cç][ãa]o de processos|[úu]ltimas movimenta[cç][õo]es|cita[cç][õo]es\s*\/\s*intima[cç][õo]es|processos com prazo|processos pendentes de cita[cç][ãa]o|processos pendentes de intima[cç][ãa]o|audi[eê]ncias/i;
  function visible(element: Element) {
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && (element as HTMLElement).getClientRects().length > 0;
  }
  function clean(value: string) {
    return value.replace(/\s+/g, " ").trim().slice(0, 120);
  }
  function category(value: string) {
    if (/rela[cç][ãa]o de processos/i.test(value)) return "Relação de Processos";
    if (/[úu]ltimas movimenta[cç][õo]es/i.test(value)) return "Últimas Movimentações";
    if (/cita[cç][õo]es\s*\/\s*intima[cç][õo]es/i.test(value)) return "Citações/Intimações";
    if (/processos com prazo/i.test(value)) return "Processos com prazo em aberto";
    if (/processos pendentes de cita[cç][ãa]o/i.test(value)) return "Processos pendentes de citação/intimação";
    if (/processos pendentes de intima[cç][ãa]o/i.test(value)) return "Processos pendentes de intimação";
    if (/audi[eê]ncias/i.test(value)) return "Audiências";
    return "Painel do Advogado";
  }
  function safePath(path: string) {
    return path.replace(/\d{5,}/g, ":id").slice(0, 160);
  }
  const sections = new Map<string, { label: string; count: number | null; path: string; queryKeys: string[] }>();
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).filter(visible);

  for (const link of links) {
    const text = clean(link.innerText || link.getAttribute("aria-label") || "");
    if (!text || !PANEL_LABEL.test(text)) continue;
    const label = category(text);
    try {
      const url = new URL(link.href);
      if (url.protocol !== "https:" || url.host !== location.host) continue;
      sections.set(label, { label, count: null, path: safePath(url.pathname), queryKeys: [...new Set(url.searchParams.keys())].slice(0, 20) });
    } catch { /* ignora link malformado ou ação não navegável */ }
  }

  for (const row of Array.from(document.querySelectorAll("tr")).filter(visible)) {
    const cells = Array.from(row.querySelectorAll("th,td")).map((cell) => clean(cell.textContent ?? ""));
    if (cells.length < 2) continue;
    const text = cells.find((cell) => PANEL_LABEL.test(cell));
    if (!text) continue;
    const label = category(text);
    const countText = [...cells].reverse().find((cell) => /^\d{1,7}$/.test(cell));
    const count = countText ? Number(countText) : null;
    const link = row.querySelector<HTMLAnchorElement>("a[href]");
    let path = "";
    let queryKeys: string[] = [];
    try {
      const url = link ? new URL(link.href) : null;
      if (url && url.protocol === "https:" && url.host === location.host) {
        path = safePath(url.pathname);
        queryKeys = [...new Set(url.searchParams.keys())].slice(0, 20);
      }
    } catch { /* o caminho permanece vazio */ }
    sections.set(label, { label, count, path, queryKeys });
  }

  return {
    host: location.host.slice(0, 100),
    path: safePath(location.pathname),
    sections: [...sections.values()].slice(0, 40),
  };
}

/** Confere que o painel permanece em uma origem oficial do destino e devolve apenas os metadados de navegação seguros. */
export async function observeEprocPanel(page: Page, target: EprocPortalTarget): Promise<EprocPanelObservation | null> {
  const url = new URL(page.url());
  if (!eprocAllowedOrigins(target).includes(url.origin)) return null;
  const panel = await page.evaluate(pageSerializable(collectEprocPanel));
  return {
    ...panel,
    sections: panel.sections.map((section) => ({ ...section, label: section.label.slice(0, 120), path: section.path.slice(0, 160), queryKeys: section.queryKeys.slice(0, 20) })),
  };
}
