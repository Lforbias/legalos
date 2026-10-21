import { runMigrations } from "../../lib/db/migrate";

export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://legalos:legalos_dev@localhost:5432/legalos_test";
  if (!/test/i.test(new URL(url).pathname)) throw new Error("E2E só roda contra um banco cujo nome contenha 'test'.");
  await runMigrations(url);
}
