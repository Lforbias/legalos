process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://legalos:legalos_dev@localhost:5432/legalos_test";
process.env.APP_URL = "http://localhost:3000";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
process.env.STORAGE_DIR = process.env.STORAGE_DIR ?? mkdtempSync(path.join(tmpdir(), "legalos-storage-"));
import { vi } from "vitest";
// Historical domain regressions still exercise the isolated legacy code. This is
// a Vitest-only mock, NOT a runtime flag or a way to enable Box in production.
// box-retirement.test.ts explicitly un-mocks it to test the actual withdrawn product.
vi.mock("@/lib/box-retirement", async (load) => ({
  ...await load<typeof import("@/lib/box-retirement")>(), BOX_AVAILABLE: true,
}));
