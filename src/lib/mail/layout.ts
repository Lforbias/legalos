/** Monta e-mail em texto simples + HTML simples (sem imagens externas, sem rastreamento). Todo conteúdo é escapado. */
export type MailContent = { title: string; paragraphs: string[]; button?: { label: string; url: string }; footer?: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function safeUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("Endereço do botão do e-mail inválido.");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Endereço do botão do e-mail inválido.");
  return u.toString();
}

export function renderMail(c: MailContent): { text: string; html: string } {
  const url = c.button ? safeUrl(c.button.url) : null;
  const text = [c.title, "", ...c.paragraphs, ...(c.button && url ? ["", `${c.button.label}: ${url}`] : []), "", c.footer ?? "LegalOS — mensagem automática, não responda este e-mail."].join("\n");
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;padding:28px">
<tr><td><h1 style="font-size:18px;margin:0 0 16px">${esc(c.title)}</h1>
${c.paragraphs.map((p) => `<p style="font-size:14px;line-height:1.55;margin:0 0 12px">${esc(p)}</p>`).join("\n")}
${c.button && url ? `<p style="margin:20px 0"><a href="${esc(url)}" style="background:#1d4ed8;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;display:inline-block">${esc(c.button.label)}</a></p><p style="font-size:12px;color:#6b7280;word-break:break-all">Se o botão não abrir, copie este endereço: ${esc(url)}</p>` : ""}
<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"><p style="font-size:12px;color:#6b7280;margin:0">${esc(c.footer ?? "LegalOS — mensagem automática, não responda este e-mail.")}</p>
</td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}
