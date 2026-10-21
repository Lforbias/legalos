import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import JSZip from "jszip";

const run = promisify(execFile);

export type ExtractStatus = "EXTRACTED" | "EMPTY" | "UNAVAILABLE" | "FAILED";
export type ExtractResult = { status: ExtractStatus; method: string | null; text: string; pages: number | null; error: string | null };

export const MAX_TEXT_CHARS = 500_000;
const INSTALL_HINT = "Instale os programas de OCR no servidor (macOS: brew install tesseract tesseract-lang poppler; Ubuntu: apt install tesseract-ocr tesseract-ocr-por poppler-utils).";

export function maxOcrPages(): number {
  const n = Number.parseInt(process.env.OCR_MAX_PAGES ?? "", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : 30;
}

/** Minúsculas e sem acentos: busca "audiencia" encontra "audiência". */
export function normalizeForSearch(s: string): string {
  // por caractere, para que as posições do texto normalizado coincidam com as do original (trechos de resultado de busca)
  return Array.from(s.normalize("NFC"), (ch) => {
    const n = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return n.length === ch.length ? n : ch;
  }).join("");
}

function tidy(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\f/g, "\n").replace(/[^\S\n]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function capped(text: string): { text: string; truncated: boolean } {
  return text.length > MAX_TEXT_CHARS ? { text: text.slice(0, MAX_TEXT_CHARS), truncated: true } : { text, truncated: false };
}

async function has(cmd: string, arg = "--version"): Promise<boolean> {
  try {
    await run(cmd, [arg], { timeout: 10_000 });
    return true;
  } catch (e) {
    // alguns programas (pdftotext) devolvem código != 0 em -v mas imprimem versão: só ENOENT significa "não instalado"
    return (e as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

let toolsCache: { tesseract: boolean; pdf: boolean; langs: string } | null = null;
export function __resetOcrToolsCache() {
  toolsCache = null;
}

export async function ocrTools(): Promise<{ tesseract: boolean; pdf: boolean; langs: string }> {
  if (toolsCache) return toolsCache;
  const [tesseract, pdftotext, pdftoppm] = await Promise.all([has("tesseract"), has("pdftotext", "-v"), has("pdftoppm", "-v")]);
  let langs = "eng";
  if (tesseract) {
    try {
      const { stdout } = await run("tesseract", ["--list-langs"], { timeout: 10_000 });
      const installed = new Set(stdout.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("List of")));
      const wanted = (process.env.OCR_LANGS ?? "por+eng").split("+").map((l) => l.trim()).filter(Boolean);
      const use = wanted.filter((l) => installed.has(l));
      langs = use.length ? use.join("+") : installed.has("eng") ? "eng" : [...installed][0] ?? "eng";
    } catch {
      /* mantém eng */
    }
  }
  toolsCache = { tesseract, pdf: pdftotext && pdftoppm, langs };
  return toolsCache;
}

async function withTmp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "legalos-ocr-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function ocrImage(file: string, langs: string): Promise<string> {
  const { stdout } = await run("tesseract", [file, "stdout", "-l", langs, "--psm", "3"], { timeout: 120_000, maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

async function fromImage(buffer: Buffer, ext: string): Promise<ExtractResult> {
  const t = await ocrTools();
  if (!t.tesseract) return { status: "UNAVAILABLE", method: null, text: "", pages: null, error: `OCR indisponível neste servidor. ${INSTALL_HINT}` };
  return withTmp(async (dir) => {
    const file = path.join(dir, `img.${ext}`);
    await writeFile(file, buffer);
    const text = tidy(await ocrImage(file, t.langs));
    return text ? { status: "EXTRACTED", method: `ocr:${t.langs}`, text, pages: 1, error: null } : { status: "EMPTY", method: `ocr:${t.langs}`, text: "", pages: 1, error: "Nenhum texto reconhecido na imagem." };
  });
}

async function fromPdf(buffer: Buffer): Promise<ExtractResult> {
  const t = await ocrTools();
  if (!t.pdf) return { status: "UNAVAILABLE", method: null, text: "", pages: null, error: `Leitura de PDF indisponível neste servidor. ${INSTALL_HINT}` };
  const limit = maxOcrPages();
  return withTmp(async (dir) => {
    const file = path.join(dir, "doc.pdf");
    await writeFile(file, buffer);
    let total: number | null = null;
    try {
      const { stdout } = await run("pdfinfo", [file], { timeout: 20_000 });
      const m = /^Pages:\s+(\d+)/m.exec(stdout);
      if (m) total = Number(m[1]);
    } catch {
      /* contagem opcional */
    }
    const last = total ? Math.min(total, limit) : limit;
    const { stdout: layer } = await run("pdftotext", ["-layout", "-f", "1", "-l", String(last), file, "-"], { timeout: 60_000, maxBuffer: 64 * 1024 * 1024 });
    const pagesRead = total ? last : Math.max(1, layer.split("\f").length - 1);
    const meaningful = layer.replace(/\s+/g, "").length;
    const note = total && total > limit ? ` Lidas as primeiras ${limit} de ${total} páginas.` : "";
    if (meaningful >= 40 * pagesRead) {
      const text = tidy(layer);
      return { status: "EXTRACTED", method: "pdf-text", text, pages: total ?? pagesRead, error: note.trim() || null };
    }
    // sem camada de texto (digitalizado): OCR página a página
    if (!t.tesseract) {
      const text = tidy(layer);
      if (text) return { status: "EXTRACTED", method: "pdf-text", text, pages: total ?? pagesRead, error: `Parte do PDF parece digitalizada e não foi lida: ${INSTALL_HINT}` };
      return { status: "UNAVAILABLE", method: null, text: "", pages: total, error: `PDF digitalizado: precisa de OCR. ${INSTALL_HINT}` };
    }
    await run("pdftoppm", ["-r", "200", "-gray", "-png", "-f", "1", "-l", String(last), file, path.join(dir, "p")], { timeout: 170_000 });
    const pngs = (await readdir(dir)).filter((f) => f.startsWith("p") && f.endsWith(".png")).sort();
    const parts: string[] = [];
    for (const f of pngs) parts.push(await ocrImage(path.join(dir, f), t.langs));
    const text = tidy(parts.join("\n\n"));
    if (!text) return { status: "EMPTY", method: `ocr:${t.langs}`, text: "", pages: total ?? pngs.length, error: `Nenhum texto reconhecido.${note}` };
    return { status: "EXTRACTED", method: `ocr:${t.langs}`, text, pages: total ?? pngs.length, error: note.trim() || null };
  });
}

function xmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\s*\/>/g, "\t")
    .replace(/<\/w:p>|<w:br\s*\/>|<\/text:p>|<\/text:h>|<text:line-break\s*\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

async function fromZipXml(buffer: Buffer, entry: string): Promise<ExtractResult> {
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file(entry);
  if (!file) return { status: "FAILED", method: null, text: "", pages: null, error: "Estrutura do arquivo não reconhecida." };
  const text = tidy(xmlToText(await file.async("string")));
  return text ? { status: "EXTRACTED", method: "office-xml", text, pages: null, error: null } : { status: "EMPTY", method: "office-xml", text: "", pages: null, error: "O documento não tem texto." };
}

/** Extrai texto de um arquivo já validado pelo upload. Nunca executa o conteúdo; ferramentas externas rodam sem shell e com tempo limite. */
export async function extractText(buffer: Buffer, ext: string): Promise<ExtractResult> {
  try {
    let r: ExtractResult;
    switch (ext.toLowerCase()) {
      case "txt":
      case "csv": {
        const text = tidy(buffer.toString("utf8"));
        r = text ? { status: "EXTRACTED", method: "plain", text, pages: null, error: null } : { status: "EMPTY", method: "plain", text: "", pages: null, error: "O arquivo não tem texto." };
        break;
      }
      case "docx":
        r = await fromZipXml(buffer, "word/document.xml");
        break;
      case "odt":
        r = await fromZipXml(buffer, "content.xml");
        break;
      case "pdf":
        r = await fromPdf(buffer);
        break;
      case "png":
      case "jpg":
      case "jpeg":
        r = await fromImage(buffer, ext.toLowerCase() === "png" ? "png" : "jpg");
        break;
      default:
        return { status: "UNAVAILABLE", method: null, text: "", pages: null, error: "Este formato (planilhas, apresentações e Word antigo) ainda não tem extração de texto." };
    }
    const c = capped(r.text);
    return c.truncated ? { ...r, text: c.text, error: [r.error, `Texto cortado em ${MAX_TEXT_CHARS.toLocaleString("pt-BR")} caracteres.`].filter(Boolean).join(" ") } : r;
  } catch (e) {
    const timeout = e instanceof Error && /timed out|ETIMEDOUT|SIGTERM/i.test(e.message);
    return { status: "FAILED", method: null, text: "", pages: null, error: timeout ? "A leitura demorou demais e foi interrompida (arquivo muito grande ou complexo)." : "Não foi possível ler o conteúdo deste arquivo (pode estar corrompido ou protegido por senha)." };
  }
}
