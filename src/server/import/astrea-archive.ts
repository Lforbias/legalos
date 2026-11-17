import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import JSZip, { type JSZipObject } from "jszip";
import { ValidationError } from "@/lib/permissions/check";

export const ASTREA_ZIP_MAX_BYTES = 48 * 1024 * 1024;
const maxExtractedBytes = 256 * 1024 * 1024;
const maxCsvBytes = 32 * 1024 * 1024;
const supported = new Set([
  "Usuário", "Qualificações", "Contatos", "Processos", "Prazos", "Tarefas", "Audiências", "Eventos",
  "Publicações", "Históricos", "Documentos", "Contas", "Categorias", "Centros de custo", "Entradas",
].map((name) => `${name}.csv`));

export async function withAstreaArchive<T>(bytes: Buffer, run: (dir: string) => Promise<T>) {
  if (!bytes.length || bytes.length > ASTREA_ZIP_MAX_BYTES) throw new ValidationError("Selecione um ZIP do Astrea de até 48 MB.");
  const zip = await JSZip.loadAsync(bytes).catch(() => {
    throw new ValidationError("Não foi possível ler o ZIP. Use o backup exportado pelo Astrea.");
  });
  const groups = new Map<string, Map<string, JSZipObject>>();
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const name = path.posix.basename(entry.name).normalize("NFC");
    if (!supported.has(name)) continue;
    const parent = path.posix.dirname(entry.name);
    const files = groups.get(parent) ?? new Map<string, JSZipObject>();
    if (files.has(name)) throw new ValidationError("O ZIP contém planilhas duplicadas.");
    files.set(name, entry);
    groups.set(parent, files);
  }
  const candidate = [...groups.values()].filter((files) => files.has("Contatos.csv") || files.has("Processos.csv"));
  if (candidate.length !== 1) throw new ValidationError("O ZIP precisa conter um único backup do Astrea com Contatos.csv ou Processos.csv.");

  const dir = await mkdtemp(path.join(tmpdir(), "legalos-astrea-"));
  let extracted = 0;
  try {
    for (const [name, entry] of candidate[0]!) {
      let fileBytes = 0;
      const limit = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          extracted += chunk.length;
          fileBytes += chunk.length;
          if (extracted > maxExtractedBytes || (name !== "Históricos.csv" && fileBytes > maxCsvBytes)) {
            callback(new ValidationError("As planilhas descompactadas ultrapassam o limite de importação pelo painel."));
          } else {
            callback(null, chunk);
          }
        },
      });
      try {
        await pipeline(entry.nodeStream(), limit, createWriteStream(path.join(dir, name), { flags: "wx", mode: 0o600 }));
      } catch (error) {
        if (error instanceof ValidationError) throw error;
        throw new ValidationError("Uma planilha do ZIP está danificada ou não pôde ser extraída.");
      }
    }
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
