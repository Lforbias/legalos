/** Valores monetários em BRL. Nunca usamos `number` para persistir dinheiro: a conversão resulta em string decimal. */
export function parseMoneyBR(input: string): string | null {
  const raw = input.trim().replace(/^R\$\s*/i, "");
  if (!raw) return null;
  let normalized: string;
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(raw)) normalized = raw.replace(/\./g, "").replace(",", ".");
  else if (/^\d+(,\d{1,2})?$/.test(raw)) normalized = raw.replace(",", ".");
  else if (/^\d+(\.\d{1,2})?$/.test(raw)) normalized = raw;
  else return null;
  const [int = "0", frac = ""] = normalized.split(".");
  if (int.length > 12) return null; // numeric(14,2)
  return `${int.replace(/^0+(?=\d)/, "")}.${frac.padEnd(2, "0")}`;
}

export function formatMoneyBR(value: string | number | { toString(): string } | null | undefined): string {
  if (value == null) return "—";
  const [int = "0", frac = "00"] = String(value).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${grouped},${frac.padEnd(2, "0").slice(0, 2)}`;
}
