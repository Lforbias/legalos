import { Client } from "pg";
import { runMigrations } from "../../lib/db/migrate";

const url = process.env.TEST_DATABASE_URL ?? "postgresql://legalos:legalos_dev@localhost:5432/legalos_test";

export default async function setup() {
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error(`Recusado: TEST_DATABASE_URL deve apontar para um banco de testes (nome contendo "test"). Recebido: ${url}`);
  }
  const c = new Client({ connectionString: url });
  await c.connect();
  await c.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  await c.end();
  await runMigrations(url);
}
