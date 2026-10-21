import { createReadStream } from "node:fs";
import { mkdir, writeFile, unlink, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

/**
 * Armazenamento de arquivos em disco local (adaptador padrão). Os arquivos ficam FORA de `public/`, nunca são
 * servidos diretamente e só são lidos por rotas autenticadas que verificam escritório e permissão.
 * Para produção em múltiplas instâncias, implemente a mesma interface com um object storage privado (S3/GCS).
 * Diretório configurável por `STORAGE_DIR` (padrão: ./.storage).
 */
const KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function baseDir() {
  return path.resolve(process.env.STORAGE_DIR ?? path.join(process.cwd(), ".storage"));
}

function resolveKey(key: string): string {
  if (!KEY_RE.test(key)) throw new Error("Chave de armazenamento inválida.");
  const full = path.resolve(baseDir(), key);
  if (!full.startsWith(baseDir() + path.sep)) throw new Error("Chave de armazenamento inválida.");
  return full;
}

export async function putObject(key: string, data: Buffer): Promise<void> {
  const full = resolveKey(key);
  await mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
  await writeFile(full, data, { flag: "wx", mode: 0o600 });
}

export async function getObjectStream(key: string): Promise<ReadableStream<Uint8Array>> {
  const full = resolveKey(key);
  await stat(full);
  return Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>;
}

export async function deleteObject(key: string): Promise<void> {
  await unlink(resolveKey(key)).catch(() => undefined);
}
