export const brl = (cents: number | null | undefined) => (cents == null ? "—" : (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }));
export const brl2 = (cents: number | null | undefined) => (cents == null ? "—" : (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
export const centsToInput = (cents: number | null | undefined) => (cents == null ? "" : (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const dateBR = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
export const dateTimeBR = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—");
export const toInputDate = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
export const toInputDateTime = (d: Date | string | null | undefined) => {
  if (!d) return "";
  const x = new Date(d);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
};
