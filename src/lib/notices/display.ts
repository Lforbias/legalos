/** Converte o HTML das publicações em texto. O original é preservado no banco;
 * o resultado continua sendo renderizado como texto pelo React, nunca como HTML. */
export function noticeDisplayText(content: string): string {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return content
    .replace(/<!--[^]*?-->/g, "")
    .replace(/<(script|style)\b[^>]*>[^]*?<\/\1\s*>/gi, "")
    .replace(/<br\b[^>]*\/?>/gi, "\n")
    .replace(/<\/?(?:p|div|li|tr|h[1-6]|blockquote)\b[^>]*>/gi, "\n")
    .replace(/<\/?(?:span|strong|em|b|i|u|a|ul|ol|table|thead|tbody|hr)\b[^>]*>/gi, "")
    .replace(/<\/?(?:td|th)\b[^>]*>/gi, " ")
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code: string) => {
      if (!code.startsWith("#")) return entities[code.toLowerCase()] ?? entity;
      const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : entity;
    })
    .replace(/[\t \u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
