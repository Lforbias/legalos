/**
 * Motor de mesclagem de modelos. Campos no formato {{grupo.campo}}. Função pura (sem I/O) para ser testável.
 * Valores ausentes NUNCA são inventados: viram "[PREENCHER: rótulo]" no texto e são devolvidos em `missing`.
 */
export const TEMPLATE_VARIABLES = [
  { key: "escritorio.nome", label: "Nome do escritório", group: "Escritório" },
  { key: "advogado.nome", label: "Nome de quem gera o documento", group: "Escritório" },
  { key: "data.hoje", label: "Data de hoje (dd/mm/aaaa)", group: "Data" },
  { key: "data.hoje_extenso", label: "Data de hoje por extenso", group: "Data" },
  { key: "cliente.nome", label: "Nome do cliente", group: "Cliente" },
  { key: "cliente.documento", label: "CPF/CNPJ do cliente", group: "Cliente" },
  { key: "cliente.email", label: "E-mail do cliente", group: "Cliente" },
  { key: "cliente.telefone", label: "Telefone do cliente", group: "Cliente" },
  { key: "cliente.endereco", label: "Endereço do cliente", group: "Cliente" },
  { key: "processo.numero", label: "Número do processo (CNJ)", group: "Processo" },
  { key: "processo.titulo", label: "Título do processo", group: "Processo" },
  { key: "processo.tribunal", label: "Tribunal / órgão", group: "Processo" },
  { key: "processo.vara", label: "Vara / unidade", group: "Processo" },
  { key: "processo.area", label: "Área", group: "Processo" },
  { key: "processo.assunto", label: "Assunto", group: "Processo" },
  { key: "processo.fase", label: "Fase", group: "Processo" },
  { key: "processo.valor_causa", label: "Valor da causa", group: "Processo" },
] as const;

export type TemplateVariableKey = (typeof TEMPLATE_VARIABLES)[number]["key"];
export type MergeValues = Partial<Record<TemplateVariableKey, string | null | undefined>>;

const KNOWN = new Map<string, string>(TEMPLATE_VARIABLES.map((v) => [v.key, v.label]));
const TOKEN = /\{\{\s*([^{}]*?)\s*\}\}/g;

export function isKnownVariable(key: string): boolean {
  return KNOWN.has(key);
}

/** Campos usados no texto, sem repetição, na ordem em que aparecem. */
export function extractVariables(body: string): string[] {
  const seen = new Set<string>();
  for (const m of body.matchAll(TOKEN)) seen.add((m[1] ?? "").trim());
  return [...seen];
}

export const SNIPPET_PREFIX = "autotexto.";
export const SNIPPET_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const isSnippetKey = (key: string) => key.startsWith(SNIPPET_PREFIX);
export const snippetSlug = (key: string) => key.slice(SNIPPET_PREFIX.length);

/**
 * Campos desconhecidos (erro de digitação) ou chaves malformadas "{{ }}".
 * Com `snippetSlugs`, {{autotexto.<slug>}} é aceito quando o autotexto existe (e desconhecido quando não existe).
 * Sem `snippetSlugs`, qualquer {{autotexto.*}} é tratado como desconhecido.
 */
export function findUnknownVariables(body: string, snippetSlugs?: ReadonlySet<string>): string[] {
  return extractVariables(body).filter((k) => {
    if (KNOWN.has(k)) return false;
    if (isSnippetKey(k) && snippetSlugs) return !snippetSlugs.has(snippetSlug(k));
    return true;
  });
}

/**
 * Troca {{autotexto.<slug>}} pelo texto do autotexto (uma única passada: o texto inserido não é expandido de novo).
 * Autotexto inexistente/desativado vira "[AUTOTEXTO NÃO ENCONTRADO: slug]" — nunca é inventado.
 */
export function expandSnippets(body: string, snippets: ReadonlyMap<string, string>): string {
  return body.replace(TOKEN, (all, raw: string) => {
    const key = raw.trim();
    if (!isSnippetKey(key)) return all;
    const text = snippets.get(snippetSlug(key));
    return text ?? `[AUTOTEXTO NÃO ENCONTRADO: ${snippetSlug(key)}]`;
  });
}

export function renderTemplate(body: string, values: MergeValues): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const text = body.replace(TOKEN, (_all, raw: string) => {
    const key = raw.trim();
    const label = KNOWN.get(key);
    if (!label) return `[CAMPO DESCONHECIDO: ${key}]`;
    const v = (values as Record<string, string | null | undefined>)[key];
    if (v == null || String(v).trim() === "") {
      missing.add(key);
      return `[PREENCHER: ${label}]`;
    }
    return String(v);
  });
  return { text, missing: [...missing] };
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** ymd = "2026-10-17" */
export function longDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${d} de ${MONTHS[(m ?? 1) - 1]} de ${y}`;
}
export function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}
