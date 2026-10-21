import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { totpCode, totpStep } from "../../lib/security/totp";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);
const DB = process.env.TEST_DATABASE_URL ?? "postgresql://legalos:legalos_dev@localhost:5432/legalos_test";

async function register(page: Page, label: string, withOrg: boolean) {
  const id = uid();
  const email = `${label}-${id}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Pessoa ${label}${id}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  if (withOrg) {
    await page.getByLabel("Nome do escritório").fill(`Banca ${label} ${id}`);
    await page.getByRole("button", { name: "Criar escritório" }).click();
    await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();
  } else {
    await expect(page.getByLabel("Nome do escritório")).toBeVisible();
  }
  return { id, email };
}

async function enableMfa(page: Page) {
  const secret = (await page.getByTestId("mfa-secret").textContent())!.trim();
  await page.getByLabel("Código de 6 dígitos").fill(totpCode(secret, totpStep()));
  await page.getByRole("button", { name: "Ativar", exact: true }).click();
  await page.getByRole("button", { name: "Já guardei os códigos" }).click();
}

test("aniversariantes na Central de alertas (com aviso de WhatsApp desconectado) e exportação para Excel", async ({ page }) => {
  await register(page, "f6-aniv", true);
  await page.goto("/clientes/novo");
  await page.getByLabel("Nome", { exact: false }).first().fill("Maria Aniversariante");
  await page.getByLabel("Telefone / WhatsApp").fill("(71) 98888-7777");
  await page.getByLabel("Data de nascimento").fill(`1985-${new Date().toISOString().slice(5, 10)}`);
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page.getByRole("heading", { name: "Maria Aniversariante" })).toBeVisible();

  await page.goto("/alertas?aba=aniversarios");
  const list = page.getByTestId("alerts-list");
  await expect(list).toContainText("Maria Aniversariante");
  // WhatsApp não conectado: o botão não aparece e o motivo é explicado
  await expect(page.getByTestId("send-client-blocked")).toContainText("não está conectado");
  await expect(page.getByTestId("send-client-open")).toHaveCount(0);

  // exportação geral para Excel
  await page.goto("/clientes");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-clientes").getByRole("link", { name: "Exportar Excel" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^clientes-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const file = await download.path();
  const bytes = await readFile(file!);
  expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  expect(bytes.length).toBeGreaterThan(500);
  // CSV continua disponível
  const csv = await page.request.get("/api/export?tipo=clientes&formato=csv");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("Maria Aniversariante");
  // lista desconhecida é recusada
  expect((await page.request.get("/api/export?tipo=qualquer")).status()).toBe(422);
});

test("2FA obrigatório: o dono liga, quem não ativou fica preso na tela de ativação até ativar", async ({ page, browser }) => {
  const owner = await register(page, "f6-mfa", true);
  // o dono precisa do próprio 2FA antes de exigir dos outros
  await page.goto("/conta");
  await page.getByRole("button", { name: "Ativar verificação em duas etapas" }).click();
  await enableMfa(page);
  await page.goto("/configuracoes");
  const card = page.getByTestId("require-mfa-card");
  await expect(card.getByTestId("require-mfa-status")).toHaveText("Desligado");
  await card.getByRole("button", { name: "Ligar" }).click();
  await expect(card.getByTestId("require-mfa-status")).toHaveText("Ligado");

  // segunda pessoa, ainda sem escritório; entra na equipe do primeiro por fora (equivale a aceitar um convite)
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  const second = await register(page2, "f6-mfa2", false);
  const c = new Client({ connectionString: DB });
  await c.connect();
  await c.query(
    `INSERT INTO memberships (organization_id, user_id, role_id, status)
     SELECT o.id, u.id, r.id, 'ACTIVE' FROM users u, users ow
       JOIN memberships m ON m.user_id = ow.id JOIN organizations o ON o.id = m.organization_id
       JOIN roles r ON r.organization_id = o.id AND r.key = 'ASSISTANT'
      WHERE u.email = $1 AND ow.email = $2`,
    [second.email, owner.email],
  );
  await c.end();

  await page2.goto("/");
  await expect(page2).toHaveURL(/\/exigir-2fa$/);
  await expect(page2.getByTestId("require-mfa-page")).toBeVisible();
  await page2.goto("/tarefas");
  await expect(page2).toHaveURL(/\/exigir-2fa$/);
  expect((await page2.request.get("/api/export?tipo=clientes")).status()).toBe(401);

  await page2.getByRole("button", { name: "Ativar verificação em duas etapas" }).click();
  await enableMfa(page2);
  await expect(page2).not.toHaveURL(/\/exigir-2fa/);
  await expect(page2.getByRole("heading", { name: /Olá/ })).toBeVisible();
  await ctx2.close();
});
