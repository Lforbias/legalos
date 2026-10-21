export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Fusos oferecidos na interface (Brasil + alguns comuns). A validação aceita qualquer fuso IANA válido. */
export const TIMEZONE_OPTIONS = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Bahia",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Rio_Branco",
  "America/Noronha",
  "America/New_York",
  "Europe/Lisbon",
  "UTC",
] as const;
