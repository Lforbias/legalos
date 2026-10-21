/** Timbrado aplicado ao gerar .docx e PDF. Dados já validados pelo serviço (logo é PNG ou JPEG). */
export type LetterheadData = {
  headerText: string | null;
  footerText: string | null;
  logo: Uint8Array | null;
  logoMime: "image/png" | "image/jpeg" | null;
  showPageNumbers: boolean;
};

export const LOGO_MAX_BYTES = 300 * 1024;

/** Reconhece PNG/JPEG pelos primeiros bytes (não confia no tipo informado pelo navegador). */
export function sniffImage(buf: Uint8Array): "image/png" | "image/jpeg" | null {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  return null;
}

/** Largura/altura de PNG ou JPEG (para manter a proporção do logo). */
export function imageSize(buf: Uint8Array): { width: number; height: number } | null {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (sniffImage(buf) === "image/png" && buf.length >= 24) return { width: dv.getUint32(16), height: dv.getUint32(20) };
  if (sniffImage(buf) === "image/jpeg") {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1]!;
      const len = dv.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { height: dv.getUint16(i + 5), width: dv.getUint16(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}
