process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://legalos:legalos_dev@localhost:5432/legalos_test";
process.env.APP_URL = "http://localhost:3000";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
process.env.STORAGE_DIR = process.env.STORAGE_DIR ?? mkdtempSync(path.join(tmpdir(), "legalos-storage-"));
