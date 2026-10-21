import { describe, expect, it } from "vitest";
import { checkProductionEnv } from "@/lib/config/prod-check";

const good = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://u:senha-forte@db.exemplo.com:5432/legalos?sslmode=require",
  APP_URL: "https://app.exemplo.com",
  MFA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  CERT_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"),
  STORAGE_DIR: "/data/storage",
  BACKUP_DIR: "/backups",
  MAIL_DRIVER: "smtp",
  SMTP_HOST: "smtp.exemplo.com",
  MAIL_FROM: "LegalOS <nao-responda@exemplo.com>",
  PETITIONING_ADAPTER: "real",
  REGISTRATION_MODE: "closed",
  ASAAS_API_KEY: "aact_prod_xxx",
  ASAAS_WEBHOOK_TOKEN: "t".repeat(32),
  ASAAS_ENV: "production",
  WHATSAPP_APP_SECRET: "s".repeat(32),
  WHATSAPP_VERIFY_TOKEN: "v".repeat(24),
  CRON_SECRET: "c".repeat(32),
};
const codes = (env: Record<string, string | undefined>, level?: string) => checkProductionEnv(env).filter((i) => !level || i.level === level).map((i) => i.code);

describe("checagem de produção", () => {
  it("ambiente correto não tem erros nem avisos", () => {
    expect(checkProductionEnv(good)).toEqual([]);
  });
  it("erros bloqueantes: sem banco, APP_URL http, sem chave MFA, chave curta, multiplicador de teste, binário falso do Prisma", () => {
    expect(codes({}, "error")).toEqual(expect.arrayContaining(["DATABASE_URL", "APP_URL", "MFA_KEY"]));
    expect(codes({ ...good, APP_URL: "http://app.exemplo.com" }, "error")).toContain("APP_URL_HTTPS");
    expect(codes({ ...good, MFA_ENCRYPTION_KEY: "curta" }, "error")).toContain("MFA_KEY_LEN");
    expect(codes({ ...good, CERT_ENCRYPTION_KEY: good.MFA_ENCRYPTION_KEY }, "error")).toContain("CERT_KEY_REUSE");
    expect(codes({ ...good, RATE_LIMIT_MULTIPLIER: "100" }, "error")).toContain("RATE_LIMIT");
    expect(codes({ ...good, PRISMA_QUERY_ENGINE_LIBRARY: "/bin/true" }, "error")).toContain("PRISMA_FAKE");
  });
  it("avisos honestos: e-mail console, banco local, storage e backup não configurados, peticionamento demo", () => {
    const w = codes({ NODE_ENV: "production", DATABASE_URL: "postgresql://legalos:legalos_dev@localhost:5432/legalos", APP_URL: "https://a.com", MFA_ENCRYPTION_KEY: good.MFA_ENCRYPTION_KEY }, "warn");
    expect(w).toEqual(expect.arrayContaining(["DATABASE_LOCAL", "MAIL_CONSOLE", "STORAGE_DIR", "BACKUP_DIR", "PETITION_DEMO"]));
    expect(codes({ ...good, DATABASE_URL: "postgresql://u:p@db.exemplo.com:5432/x" }, "warn")).toContain("DATABASE_SSL");
  });
});
