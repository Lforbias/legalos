/**
 * "Assinatura" de uma tela: só estrutura (endereço sem parâmetros, títulos, nomes de campos e de botões). Serve para
 * diagnosticar quando o portal muda a tela, sem guardar conteúdo de processos nem dados pessoais.
 */
export type FrameSignature = { host: string; path: string; title: string; fields: string[]; buttons: string[] };
export type PageSignature = {
  host: string;
  path: string;
  title: string;
  headings: string[];
  fields: string[];
  buttons: string[];
  /** Quadros internos (iframes/modais) da página: só estrutura, como o restante da assinatura. */
  frames?: FrameSignature[];
  /** Quantas abas/janelas o navegador isolado tinha abertas ao ler a tela. */
  pages?: number;
};

/**
 * tsx/esbuild adds a Node-only `__name` helper around named functions. Playwright serializes a function into the
 * browser, where that helper does not exist. Strip those name markers before passing self-contained classifiers to
 * `page.evaluate`.
 */
export function pageSerializable<F extends (...args: never[]) => unknown>(fn: F): F {
  const source = fn.toString().replace(/\b__name\(([A-Za-z_$][\w$]*),\s*(['"])[^'"]*\2\);?/g, "");
  return new Function(`return (${source})`)() as F;
}

const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

/** Remove e-mails, sequências de 3+ dígitos e quaisquer palavras do nome da pessoa (para nunca vazar e-mail, CPF, número de processo ou nome). */
export function redactText(text: string, names: readonly string[] = []): string {
  let out = text.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "•@•").replace(/\d{3,}/g, "#");
  for (const raw of names) {
    for (const part of raw.split(/\s+/)) {
      const p = part.trim();
      if (p.length < 3) continue;
      out = out.replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "•");
    }
  }
  return out;
}

/** Só endereço e caminho de uma URL: nunca a query nem o fragmento (podem carregar tokens, hashes de sessão ou números de processo). */
export function hostAndPath(raw: string): { host: string; path: string } {
  try {
    const url = new URL(raw);
    return { host: url.host, path: url.pathname.replace(/;jsessionid=[^/?]*/i, "") };
  } catch {
    return { host: "", path: "" };
  }
}

export function sanitizeSignature(raw: PageSignature, names: readonly string[] = []): PageSignature {
  const safe = (s: string, n: number) => clip(redactText(s, names), n);
  return {
    host: clip(raw.host, 80),
    path: safe(raw.path.replace(/;jsessionid=[^/?]*/i, ""), 120),
    title: safe(raw.title, 120),
    headings: raw.headings.slice(0, 8).map((h) => safe(h, 80)).filter(Boolean),
    fields: raw.fields.slice(0, 20).map((f) => safe(f, 60)).filter(Boolean),
    buttons: raw.buttons.slice(0, 12).map((b) => safe(b, 60)).filter(Boolean),
    ...(raw.frames?.length
      ? {
          frames: raw.frames.slice(0, 6).map((f) => ({
            host: clip(f.host, 80),
            path: safe(f.path.replace(/;jsessionid=[^/?]*/i, ""), 120),
            title: safe(f.title, 80),
            fields: f.fields.slice(0, 12).map((x) => safe(x, 60)).filter(Boolean),
            buttons: f.buttons.slice(0, 8).map((x) => safe(x, 60)).filter(Boolean),
          })),
        }
      : {}),
    ...(typeof raw.pages === "number" ? { pages: Math.max(0, Math.min(20, Math.trunc(raw.pages))) } : {}),
  };
}

/** Quebra um texto em linhas de até 220 caracteres (cabem no terminal) e corta no máximo de linhas, marcando o corte com "…". */
function fitLines(text: string, maxLines: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length && out.length < maxLines; i += 220) out.push(i === 0 ? text.slice(0, 220) : `… ${text.slice(i, i + 220)}`);
  if (text.length > maxLines * 220) out[out.length - 1] = `${out[out.length - 1]!.slice(0, 219)}…`;
  return out;
}

/**
 * Linhas curtas (cabem no terminal de acompanhamento, no máximo 8) que descrevem uma assinatura já sanitizada. Só estrutura:
 * endereço sem query, título, NOMES dos campos (nunca os valores), textos de botões e quadros internos. A assinatura completa
 * continua gravada em `robot_jobs.summary.signature`.
 */
export function describeSignature(sig: PageSignature | null): string[] {
  if (!sig) return ["Diagnóstico da tela: não foi possível ler a estrutura da página (ela pode ter fechado durante a leitura)."];
  const lines = fitLines(`Diagnóstico da tela (só estrutura; valores de campos nunca são lidos): ${sig.host || "(sem endereço)"}${sig.path}${sig.title ? ` · título "${sig.title}"` : ""}.`, 1);
  if (sig.fields.length) lines.push(...fitLines(`Campos (nomes): ${sig.fields.join(", ")}`, 2));
  if (sig.buttons.length) lines.push(...fitLines(`Botões: ${sig.buttons.join(", ")}`, 1));
  for (const f of (sig.frames ?? []).slice(0, 3)) {
    lines.push(...fitLines(`Quadro interno: ${f.host || "(sem endereço)"}${f.path}${f.fields.length ? ` · campos: ${f.fields.join(", ")}` : ""}${f.buttons.length ? ` · botões: ${f.buttons.join(", ")}` : ""}`, 1));
  }
  if (sig.pages && sig.pages > 1) lines.push(`Abas abertas no navegador isolado: ${sig.pages}.`);
  return lines.slice(0, 8);
}
