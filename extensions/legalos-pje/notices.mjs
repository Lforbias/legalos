/* Serialized into the active page only on a popup gesture. No clicks, fetch, forms or cookies. */
export function inspectTrf3Notices() {
  const fail = message => ({ ok: false, message, items: [] });
  if (window.top !== window || location.origin !== "https://pje1g.trf3.jus.br" || location.pathname !== "/pje/Painel/painel_usuario/advogado.seam") return fail("Abra a lista de expedientes no painel do advogado do TRF3, 1º grau. Outros tribunais ainda não foram validados para esta captura.");
  if (document.querySelector('input[type="password"]')) return fail("Conclua o login com certificado/PJeOffice e OTP no portal oficial.");
  const visible = e => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
  const items = []; const seen = new Set(); let skipped = 0;
  for (const row of document.querySelectorAll("tr")) {
    if (!visible(row)) continue;
    const text = row.innerText || "";
    // Ignore outer layout rows and never infer an expedition from CNJ alone.
    if (row.querySelector("table")) continue;
    const numbers = [...new Set(text.match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g) || [])];
    if (!numbers.length) continue;
    const ref = text.match(/(?:^|\n)\s*(Decis[aã]o|Intima[cç][aã]o|Cita[cç][aã]o|Senten[cç]a|Despacho|Ato ordinat[oó]rio)\s*\((\d{1,20})\)/i);
    const communication = text.match(/(?:Di[aá]rio Eletr[oô]nico|Sistema|PJe)\s*\(\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})\s*\)/i);
    if (numbers.length !== 1 || !ref || !communication) { skipped++; continue; }
    const item = { caseNumber: numbers[0], reference: ref[2], title: ref[1], communicatedAt: `${communication[3]}-${communication[2]}-${communication[1]} ${communication[4]}` };
    const key = `${item.caseNumber}:${item.reference}:${item.communicatedAt}`;
    if (!seen.has(key)) { seen.add(key); items.push(item); }
  }
  if (!items.length) return fail("Nenhuma linha compatível visível. Expanda a jurisdição e clique na Caixa de entrada. Não abra o teor de expedientes. Se houver linhas, o layout precisa ser validado; nada foi enviado.");
  if (items.length > 50) return fail("Mais de 50 registros nesta página. Reduza a página antes de capturar.");
  return { ok: true, sourceOrigin: location.origin, sourcePath: location.pathname, items, skipped, message: `${items.length} registro(s) visível(is), ${skipped} linha(s) não interpretada(s). Só esta página será importada.` };
}
