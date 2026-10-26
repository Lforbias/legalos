/** Montagem de preço de uma proposta: plano + aditivos − desconto. Preço ausente nunca vira zero escondido: vira aviso. */
export type QuoteAddon = { key: string; name: string; priceCents: number | null; perUser: boolean };
export type QuoteInput = { planName: string; planPriceCents: number | null; planMaxUsers: number | null; users: number; addons: QuoteAddon[]; discountPct: number; setupCents?: number };
export type QuoteLine = { label: string; cents: number };
export type Quote = { lines: QuoteLine[]; subtotalCents: number; discountCents: number; monthlyCents: number; setupCents: number; missing: string[]; warnings: string[] };

export function computeQuote(i: QuoteInput): Quote {
  const users = Math.max(1, Math.round(i.users));
  const discount = Math.min(100, Math.max(0, Math.round(i.discountPct)));
  const lines: QuoteLine[] = [];
  const missing: string[] = [];
  const warnings: string[] = [];
  if (i.planPriceCents == null) missing.push(`Plano "${i.planName}" sem preço definido`);
  else lines.push({ label: `Plano ${i.planName}`, cents: i.planPriceCents });
  if (i.planMaxUsers != null && users > i.planMaxUsers) warnings.push(`O plano comporta até ${i.planMaxUsers} usuários; a proposta tem ${users}.`);
  for (const a of i.addons) {
    if (a.priceCents == null) {
      missing.push(`Aditivo "${a.name}" sem preço definido`);
      continue;
    }
    const cents = a.perUser ? a.priceCents * users : a.priceCents;
    lines.push({ label: a.perUser ? `${a.name} (${users} usuários)` : a.name, cents });
  }
  const subtotal = lines.reduce((s, l) => s + l.cents, 0);
  const discountCents = Math.round((subtotal * discount) / 100);
  return { lines, subtotalCents: subtotal, discountCents, monthlyCents: subtotal - discountCents, setupCents: Math.max(0, Math.round(i.setupCents ?? 0)), missing, warnings };
}
