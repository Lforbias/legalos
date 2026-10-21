import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { totpCode, totpStep } from "../../lib/security/totp";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);
const DB = process.env.TEST_DATABASE_URL ?? "postgresql://legalos:legalos_dev@localhost:5432/legalos_test";

async function signUp(page: Page, label: string) {
  const id = uid();
  const email = `${label}-${id}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona ${label}${id}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca ${label} ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();
  return { id, email };
}
async function grantAdmin(email: string) {
  const c = new Client({ connectionString: DB });
  await c.connect();
  await c.query("INSERT INTO platform_admins (user_id) SELECT id FROM users WHERE email = $1 ON CONFLICT DO NOTHING", [email]);
  await c.end();
}

test("painel do developer: usuário comum recebe 404", async ({ page }) => {
  await signUp(page, "dev-comum");
  expect((await page.goto("/admin/developer"))?.status()).toBe(404);
});

test("painel do developer: dono com 2FA vê as quatro áreas, testa o banco e roda a fila de webhooks", async ({ page }) => {
  const { email } = await signUp(page, "dev-dono");
  await grantAdmin(email);
  await page.goto("/admin");
  await page.getByRole("button", { name: "Ativar verificação em duas etapas" }).click();
  const secret = (await page.getByTestId("mfa-secret").textContent())!.trim();
  await page.getByLabel("Código de 6 dígitos").fill(totpCode(secret, totpStep()));
  await page.getByRole("button", { name: "Ativar", exact: true }).click();
  await page.getByRole("button", { name: "Já guardei os códigos" }).click();

  await page.goto("/admin/developer");
  await expect(page.getByRole("heading", { name: "Painel do developer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rotinas automáticas" })).toBeVisible();
  await expect(page.getByText("Entrega de webhooks").first()).toBeVisible();

  const row = page.getByRole("row", { name: /Entrega de webhooks/ });
  await row.getByRole("button", { name: "Rodar agora" }).click();
  await expect(page.getByText(/Rotina concluída/)).toBeVisible();

  await page.getByRole("link", { name: "API, chaves e webhooks" }).click();
  await expect(page.getByRole("heading", { name: "Chaves de API" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Fila de e-mails" })).toBeVisible();

  await page.getByRole("link", { name: "Auditoria e erros" }).click();
  await expect(page.getByRole("heading", { name: "Erros inesperados" })).toBeVisible();
  await expect(page.getByText("platform.job_run").first()).toBeVisible();

  await page.getByRole("link", { name: "Integrações e interruptores" }).click();
  await expect(page.getByRole("heading", { name: "Testar integrações" })).toBeVisible();
  await page.getByRole("button", { name: "Testar" }).first().click();
  await expect(page.getByText(/OK \(\d+ ms\) — Banco respondeu/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Interruptores por escritório" })).toBeVisible();

  // comunicados: confere quem recebe antes de enviar (só para si, pelo sistema)
  await page.getByRole("link", { name: "Comunicados" }).click();
  const ann = page.getByTestId("announcement-form");
  await expect(ann).toBeVisible();
  await ann.getByLabel("Para quem").selectOption("USER");
  await ann.getByLabel("E-mail da pessoa").fill(email);
  await ann.getByLabel(/^Título/).fill("Teste de comunicado");
  await ann.getByLabel(/^Mensagem/).fill("Mensagem de teste do developer.");
  await ann.getByLabel("Aviso no celular").uncheck();
  await ann.getByTestId("ann-check").click();
  await expect(ann.getByTestId("ann-preview")).toContainText("1 pessoa");
  await ann.getByTestId("ann-send").click();
  await expect(ann.getByText(/Enviado a 1 pessoa/)).toBeVisible();
  await expect(page.getByTestId("ann-history")).toContainText("Teste de comunicado");

  await page.getByRole("link", { name: "Novidades e andamento" }).click();
  await expect(page.getByRole("heading", { name: "Já feito (mais recente primeiro)" })).toBeVisible();
  await expect(page.getByText("Painel do developer").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Versão 3.0.0/ })).toBeVisible();
});
