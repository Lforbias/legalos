import { isYmd } from "./ymd";

/** Converte "AAAA-MM-DD" inicial e final (inclusive) em intervalo [from, to) em UTC. Devolve null se inválido. */
export function ymdRange(from: string | null | undefined, to: string | null | undefined): { from: Date; to: Date } | null {
  if (!from || !to || !isYmd(from) || !isYmd(to)) return null;
  const a = new Date(`${from}T00:00:00.000Z`);
  const b = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86_400_000);
  return Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) ? null : { from: a, to: b };
}
