/**
 * Validadores de documentos brasileiros (algoritmos oficiais). Funções puras, sem dependências.
 * - CPF: 11 dígitos, 2 dígitos verificadores (módulo 11).
 * - CNPJ: 14 posições; desde jul/2026 a base (12 primeiras) pode ser alfanumérica (valor = código ASCII − 48),
 *   mantendo os 2 dígitos verificadores numéricos. CNPJs numéricos antigos continuam válidos.
 * - Número CNJ (Resolução 65/2008): NNNNNNN-DD.AAAA.J.TR.OOOO, verificado por módulo 97 base 10 (ISO 7064).
 */

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidCpf(input: string): boolean {
  const cpf = onlyDigits(input);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

/** Remove máscara do CNPJ preservando letras (maiúsculas) e dígitos. */
export function normalizeCnpj(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function isValidCnpj(input: string): boolean {
  const cnpj = normalizeCnpj(input);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) return false;
  if (/^(.)\1{13}$/.test(cnpj)) return false;
  const value = (ch: string) => ch.charCodeAt(0) - 48;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += value(cnpj[i] as string) * (weights[i] as number);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

export function formatCpf(digits: string): string {
  const d = onlyDigits(digits);
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : digits;
}

export function formatCnpj(value: string): string {
  const c = normalizeCnpj(value);
  return c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : value;
}

/** Normaliza o documento conforme o tipo de pessoa. Retorna `null` se inválido. */
export function normalizeDocument(kind: "PERSON" | "COMPANY", input: string): string | null {
  if (kind === "PERSON") {
    const d = onlyDigits(input);
    return isValidCpf(d) ? d : null;
  }
  const c = normalizeCnpj(input);
  return isValidCnpj(c) ? c : null;
}

export function formatDocument(kind: "PERSON" | "COMPANY", stored: string | null | undefined): string {
  if (!stored) return "";
  return kind === "PERSON" ? formatCpf(stored) : formatCnpj(stored);
}

// ---------- Número CNJ ----------

const CNJ_RE = /^(\d{7})-?(\d{2})\.?(\d{4})\.?(\d)\.?(\d{2})\.?(\d{4})$/;

export type CnjParts = { sequence: string; check: string; year: string; segment: string; court: string; origin: string };

export function parseCnj(input: string): CnjParts | null {
  const m = CNJ_RE.exec(input.trim());
  if (!m) return null;
  return { sequence: m[1]!, check: m[2]!, year: m[3]!, segment: m[4]!, court: m[5]!, origin: m[6]! };
}

export function isValidCnj(input: string): boolean {
  const p = parseCnj(input);
  if (!p) return false;
  // válido quando (NNNNNNN AAAA J TR OOOO DD) mod 97 == 1
  const n = BigInt(`${p.sequence}${p.year}${p.segment}${p.court}${p.origin}${p.check}`);
  return n % 97n === 1n;
}

/** Dígito verificador esperado para os demais campos (útil em testes e para sugerir correção). */
export function computeCnjCheck(p: Omit<CnjParts, "check">): string {
  const n = BigInt(`${p.sequence}${p.year}${p.segment}${p.court}${p.origin}00`);
  return String(98n - (n % 97n)).padStart(2, "0");
}

export function formatCnj(input: string): string {
  const p = parseCnj(input);
  return p ? `${p.sequence}-${p.check}.${p.year}.${p.segment}.${p.court}.${p.origin}` : input;
}

/** Ramo da Justiça (campo J do número CNJ). */
export const CNJ_SEGMENTS: Record<string, string> = {
  "1": "Supremo Tribunal Federal",
  "2": "Conselho Nacional de Justiça",
  "3": "Superior Tribunal de Justiça",
  "4": "Justiça Federal",
  "5": "Justiça do Trabalho",
  "6": "Justiça Eleitoral",
  "7": "Justiça Militar da União",
  "8": "Justiça dos Estados e do DF",
  "9": "Justiça Militar Estadual",
};
