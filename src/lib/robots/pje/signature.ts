/**
 * "Assinatura" de uma tela: só estrutura (endereço sem parâmetros, títulos, nomes de campos e de botões). Serve para
 * diagnosticar quando o portal muda a tela, sem guardar conteúdo de processos nem dados pessoais.
 */
export type PageSignature = { host: string; path: string; title: string; headings: string[]; fields: string[]; buttons: string[] };

const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

/** Remove sequências de 3+ dígitos e quaisquer palavras do nome da pessoa (para nunca vazar CPF, número de processo ou nome). */
export function redactText(text: string, names: readonly string[] = []): string {
  let out = text.replace(/\d{3,}/g, "#");
  for (const raw of names) {
    for (const part of raw.split(/\s+/)) {
      const p = part.trim();
      if (p.length < 3) continue;
      out = out.replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "•");
    }
  }
  return out;
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
  };
}
