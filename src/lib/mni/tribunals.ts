import { datajudAlias } from "@/lib/datajud/client";

export type Tribunal = { jtr: string; alias: string; label: string };

export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SE", "SP", "TO"];

/** Tribunais que podem ter MNI (PJe): Federal (TRF1-6), Trabalho (TRT1-24) e Estaduais (TJ). A lista NÃO garante que o tribunal habilitou o MNI. */
export function listTribunals(): Tribunal[] {
  const out: Tribunal[] = [];
  const push = (seg: string, tr: number, label: string) => {
    const jtr = `${seg}.${String(tr).padStart(2, "0")}`;
    const cnj = `0000000-00.2024.${seg}.${String(tr).padStart(2, "0")}.0000`;
    out.push({ jtr, alias: datajudAlias(cnj) ?? jtr, label });
  };
  for (let i = 1; i <= 6; i++) push("4", i, `TRF${i} (Justiça Federal, ${i}ª Região)`);
  for (let i = 1; i <= 24; i++) push("5", i, `TRT${i} (Justiça do Trabalho, ${i}ª Região)`);
  UFS.forEach((uf, idx) => push("8", idx + 1, `TJ${uf === "DF" ? "DFT" : uf} (Justiça Estadual)`));
  return out;
}

export const isKnownJtr = (jtr: string) => listTribunals().some((t) => t.jtr === jtr);

/** J.TR do número CNJ (ex.: "5.05" para TRT5). */
export function jtrOfCnj(cnj: string): string | null {
  const m = /^\d{7}-\d{2}\.\d{4}\.(\d)\.(\d{2})\.\d{4}$/.exec(cnj);
  return m ? `${m[1]}.${m[2]}` : null;
}
