/**
 * Números de telefone do WhatsApp (wa_id) e casamento com o cadastro de clientes.
 * O WhatsApp entrega o número só com dígitos e com o código do país (55). No Brasil, números de celular antigos foram
 * cadastrados SEM o nono dígito e ainda aparecem assim em alguns casos; por isso o casamento tenta as duas formas.
 */
export function onlyDigits(v: string): string {
  return v.replace(/\D/g, "");
}

/** Número digitado/cadastrado → wa_id (só dígitos, com 55 se parecer número brasileiro sem país). */
export function normalizeWaId(input: string): string | null {
  let d = onlyDigits(input);
  if (!d) return null;
  d = d.replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length < 11 || d.length > 15) return null;
  return d;
}

/** Todas as formas plausíveis do mesmo número (com e sem país, com e sem o nono dígito), para buscar o cliente. */
export function phoneCandidates(waId: string): string[] {
  const out = new Set<string>([waId]);
  if (waId.startsWith("55") && (waId.length === 12 || waId.length === 13)) {
    const ddd = waId.slice(2, 4);
    const rest = waId.slice(4);
    out.add(`${ddd}${rest}`);
    if (rest.length === 9 && rest.startsWith("9")) {
      out.add(`55${ddd}${rest.slice(1)}`);
      out.add(`${ddd}${rest.slice(1)}`);
    } else if (rest.length === 8 && /^[6-9]/.test(rest)) {
      out.add(`55${ddd}9${rest}`);
      out.add(`${ddd}9${rest}`);
    }
  }
  return [...out];
}

export function formatWaId(waId: string): string {
  if (waId.startsWith("lid:")) return `Contato sem telefone visível (…${onlyDigits(waId).slice(-4)})`;
  const d = onlyDigits(waId);
  if (d.startsWith("55") && (d.length === 13 || d.length === 12)) {
    const ddd = d.slice(2, 4);
    const r = d.slice(4);
    return `+55 (${ddd}) ${r.length === 9 ? `${r.slice(0, 5)}-${r.slice(5)}` : `${r.slice(0, 4)}-${r.slice(4)}`}`;
  }
  return `+${d}`;
}
