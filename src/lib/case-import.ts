import { formatCnj, isValidCnj } from "@/lib/validation/br-documents";

export const IMPORT_MAX = 200;

export type ParsedNumber = { raw: string; number: string | null; status: "OK" | "INVALID" | "DUPLICATE"; message: string | null };

/** Separa o texto colado em números CNJ (um por linha, ou separados por espaço, vírgula ou ponto e vírgula). */
export function parseNumberList(text: string): ParsedNumber[] {
  const tokens = text.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
  const seen = new Set<string>();
  return tokens.map((raw) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length !== 20 || /[^\d.\-]/.test(raw)) return { raw, number: null, status: "INVALID" as const, message: "Não parece um número CNJ (20 dígitos)." };
    const formatted = formatCnj(`${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits[13]}.${digits.slice(14, 16)}.${digits.slice(16)}`);
    if (!isValidCnj(formatted)) return { raw, number: formatted, status: "INVALID" as const, message: "Dígito verificador inválido." };
    if (seen.has(formatted)) return { raw, number: formatted, status: "DUPLICATE" as const, message: "Repetido na lista." };
    seen.add(formatted);
    return { raw, number: formatted, status: "OK" as const, message: null };
  });
}
