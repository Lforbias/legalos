import "../load-env";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import { db } from "../../src/lib/db/client";
import { importProspectSchema } from "../../src/modules/prospecting/schema";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Uso: npx tsx scripts/prospecting/import-rfb.ts .storage/cnpj/AAAA-MM/advocacia-sp.ndjson");
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Este importador está limitado ao banco local. Publicação não autorizada.");
  const manifest = JSON.parse(await readFile(path.join(path.dirname(file), "manifest.json"), "utf8"));
  if (manifest.complete !== true || !Number.isInteger(manifest.count) || manifest.count < 1) throw new Error("Manifesto completo obrigatório");
  // Valida todo o arquivo antes da primeira escrita. Transação única impede cargas parciais.
  const records: ReturnType<typeof importProspectSchema.parse>[] = [];
  const seen = new Set<string>();
  for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    const row = importProspectSchema.parse(JSON.parse(line));
    if (row.sourceMonth !== manifest.month || seen.has(row.cnpj)) throw new Error("Mês divergente ou CNPJ repetido");
    seen.add(row.cnpj);
    records.push(row);
  }
  if (records.length !== manifest.count) throw new Error("Contagem diferente do manifesto");
  await db.$transaction(async tx => {
    for (const row of records) {
      const { city: _city, state: _state, situation: _situation, ...data } = row;
      void _city; void _state; void _situation;
      const old = await tx.commercialProspect.findUnique({ where: { cnpj: row.cnpj } });
      if (old && old.sourceMonth > row.sourceMonth) throw new Error("Não é permitido substituir uma base mais recente");
      const moved = old && (old.address !== row.address || old.postalCode !== row.postalCode);
      const contactChanged = old && (old.phone !== row.phone || old.email !== row.email);
      await tx.commercialProspect.upsert({ where: { cnpj: row.cnpj }, create: data, update: {
        ...data, importedAt: new Date(), version: { increment: 1 },
        ...(moved ? { latitude: null, longitude: null, locationSource: null, locationAccuracy: null } : {}),
        ...(contactChanged ? { contactVerified: false } : {}),
      } });
    }
  }, { timeout: 600_000, maxWait: 30_000 });
  console.log(`Importados ${records.length} estabelecimentos. Etapas, notas e não contatar preservados. Cadastros ausentes de nova carga permanecem com a competência antiga visível.`);
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
