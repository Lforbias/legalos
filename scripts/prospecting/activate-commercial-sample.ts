import "../load-env";
import { db } from "../../src/lib/db/client";
import { baseProspectData } from "../../src/server/services/comercial.service";

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Apenas banco local; publicação não autorizada.");
  const rows = await db.commercialProspect.findMany({ orderBy: { cnpj: "asc" }, take: 200 });
  const result = await db.comProspect.createMany({ data: rows.map(r => baseProspectData(r, null)), skipDuplicates: true });
  await db.auditLog.create({ data: { action: "comercial.local_sample_import", metadata: { selected: rows.length, created: result.count } } });
  console.log({ selected: rows.length, created: result.count, existing: rows.length - result.count });
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
