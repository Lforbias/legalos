import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = 3100;
const WA_PORT = 3101; // servidor com cofre e WhatsApp configurados (o outro propositalmente fica SEM chave de cifra)
const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://legalos:legalos_dev@localhost:5432/legalos_test";
// Em ambientes padrão o Playwright usa o Chromium que ele mesmo instala; no sandbox usamos o pré-instalado.
const sandboxChromium = "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "src/tests/e2e",
  globalSetup: "./src/tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "pt-BR",
    launchOptions: fs.existsSync(sandboxChromium) ? { executablePath: sandboxChromium, args: ["--no-sandbox"] } : {},
  },
  projects: [
    { name: "chromium", testIgnore: /whatsapp\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "whatsapp", testMatch: /whatsapp\.spec\.ts/, use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${WA_PORT}` } },
  ],
  webServer: [
    {
      command: `npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { DATABASE_URL: TEST_DB, LEGALOS_PROTOTYPES: "1", LOG_LEVEL: "warn", RATE_LIMIT_MULTIPLIER: "100", MFA_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString("base64"), STORAGE_DIR: path.join(os.tmpdir(), "legalos-e2e-storage"), APP_URL: `http://localhost:${PORT}` },
    },
    {
      command: `npx next start -p ${WA_PORT}`,
      url: `http://localhost:${WA_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { DATABASE_URL: TEST_DB, LOG_LEVEL: "warn", RATE_LIMIT_MULTIPLIER: "100", MFA_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString("base64"), STORAGE_DIR: path.join(os.tmpdir(), "legalos-e2e-storage"), APP_URL: `http://localhost:${WA_PORT}`, CERT_ENCRYPTION_KEY: Buffer.alloc(32, 6).toString("base64"), WHATSAPP_APP_SECRET: "segredo-do-app-de-teste", WHATSAPP_VERIFY_TOKEN: "verifica-e2e-0123456789", WHATSAPP_API_URL: "http://127.0.0.1:3199", WHATSAPP_ALLOW_LOCAL: "1", WHATSAPP_QR_FAKE: "1", WHATSAPP_QR_FAKE_SCAN_MS: "1500", WHATSAPP_QR_MIN_GAP_MS: "0", WHATSAPP_QR_DISABLE_RESUME: "1" },
    },
  ],
});
