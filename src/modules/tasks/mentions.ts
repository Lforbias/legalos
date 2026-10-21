/** Menções em comentários: `@Nome Completo` de um membro ativo. Casa o nome inteiro, sem diferenciar maiúsculas/acentos de caixa. */
export function findMentions(body: string, members: { id: string; name: string }[]): string[] {
  const text = body.toLowerCase();
  const found = new Set<string>();
  // nomes mais longos primeiro: "@Ana Paula" não deve virar menção a "Ana"
  const sorted = [...members].sort((a, b) => b.name.length - a.name.length);
  let consumed = text;
  for (const m of sorted) {
    const needle = `@${m.name.toLowerCase()}`;
    let from = 0;
    for (;;) {
      const i = consumed.indexOf(needle, from);
      if (i < 0) break;
      const next = consumed[i + needle.length] ?? " ";
      if (/[\p{L}\p{N}]/u.test(next)) { from = i + 1; continue; }
      found.add(m.id);
      consumed = consumed.slice(0, i) + " ".repeat(needle.length) + consumed.slice(i + needle.length);
    }
  }
  return [...found];
}
