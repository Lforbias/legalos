/** Oculta CPF, CNPJ (numérico) e e-mails antes de enviar trechos de documentos ao provedor de IA. */
export function maskSensitive(text: string): string {
  return text
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[CNPJ]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF]")
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[E-MAIL]");
}
