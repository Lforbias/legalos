import "./load-env";
import { Client } from "pg";
import { runMigrations } from "../src/lib/db/migrate";

if (process.env.NODE_ENV === "production") {
  console.error("Recusado: db:reset não pode ser executado em produção.");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida.");

(async () => {
  const c = new Client({ connectionString: url });
  await c.connect();
  await c.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await c.end();
  const applied = await runMigrations(url, undefined, console.log);
  console.log(`Banco recriado (${applied.length} migrations).`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
