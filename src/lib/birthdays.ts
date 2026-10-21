import { addDays, diffDays } from "@/lib/dates/ymd";

/** Próximo aniversário (a partir de `today`, inclusive) de quem nasceu em `birth` (aaaa-mm-dd). 29/02 vira 28/02 em ano não bissexto. */
export function nextBirthday(birth: string, today: string): { date: string; turns: number; daysLeft: number } {
  const [by, bm, bd] = birth.split("-").map(Number) as [number, number, number];
  const ty = Number(today.slice(0, 4));
  const at = (y: number) => {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const d = bm === 2 && bd === 29 && !leap ? 28 : bd;
    return `${String(y).padStart(4, "0")}-${String(bm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  let date = at(ty);
  if (date < today) date = at(ty + 1);
  return { date, turns: Number(date.slice(0, 4)) - by, daysLeft: diffDays(date, today) };
}

export type BirthdayInput = { id: string; name: string; birthDate: string };
export type BirthdayRow = BirthdayInput & { date: string; turns: number; daysLeft: number };

/** Aniversariantes de hoje até `days` dias à frente, do mais próximo ao mais distante. */
export function birthdaysWithin(list: BirthdayInput[], today: string, days: number): BirthdayRow[] {
  const end = addDays(today, days);
  return list
    .map((c) => ({ ...c, ...nextBirthday(c.birthDate, today) }))
    .filter((c) => c.date <= end)
    .sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name, "pt-BR"));
}
