import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Client } from "pg";

/**
 * Runner de migrations SQL versionadas (prisma/migrations/<timestamp>_<nome>/migration.sql).
 *
 * Por quê existe: o ambiente de desenvolvimento original bloqueia o download dos binários do
 * Prisma (schema-engine), então `prisma migrate` não é executável lá. O formato dos arquivos é o
 * mesmo do Prisma Migrate. Em ambientes com acesso normal, `prisma migrate deploy` pode ser usado
 * em bancos NOVOS. Não misture os dois mecanismos no mesmo banco (veja docs/architecture.md).
 */
export async function runMigrations(
  databaseUrl: string,
  migrationsDir = path.resolve(process.cwd(), "prisma/migrations"),
  log: (msg: string) => void = () => {},
): Promise<string[]> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS _legalos_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    // Evita execução concorrente de migrations
    await client.query("SELECT pg_advisory_lock(727274)");
    const dirs = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    const done = new Map<string, string>(
      (await client.query<{ name: string; checksum: string }>("SELECT name, checksum FROM _legalos_migrations")).rows.map(
        (r) => [r.name, r.checksum],
      ),
    );
    for (const name of dirs) {
      const file = path.join(migrationsDir, name, "migration.sql");
      if (!fs.existsSync(file)) continue;
      const sql = fs.readFileSync(file, "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      const existing = done.get(name);
      if (existing) {
        if (existing !== checksum) {
          throw new Error(`Migration ${name} foi alterada após ser aplicada. Crie uma nova migration.`);
        }
        continue;
      }
      log(`aplicando ${name}`);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO _legalos_migrations (name, checksum) VALUES ($1, $2)", [name, checksum]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
      applied.push(name);
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(727274)").catch(() => undefined);
    await client.end();
  }
  return applied;
}
