import { expectRetired, expectRetiredApi } from "./box-retired-checks";
import { expect, test } from "@playwright/test";
import { completeWelcomeOnboarding } from "./support/welcome";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);

test("Integrações oculta o conector PJe (MNI) retirado", async ({ page }) => {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona mni${id}`);
  await page.getByLabel("E-mail").fill(`dona-mni-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await completeWelcomeOnboarding(page, `Banca mni ${id}`);
  await expect(page.getByRole("heading", { name: /Bom dia/ })).toBeVisible();

  await page.goto("/integracoes");
  await expect(page.getByText("Conexões de tribunais — MNI 2.2.2")).toHaveCount(0);
  await expectRetired(page.request, ["/integracoes/pje"]);
  await expect(page.getByRole("button", { name: "Cadastrar conexão" })).toHaveCount(0);
});

test("Integrações permite cadastro público do DJEN e mantém a rota antiga desativada", async ({ page }) => {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona captura${id}`);
  await page.getByLabel("E-mail").fill(`dona-captura-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await completeWelcomeOnboarding(page, `Banca captura ${id}`);
  await expect(page.getByRole("heading", { name: /Bom dia/ })).toBeVisible();

  await page.goto("/integracoes");
  await expect(page.getByText(/DJEN.*publicações por OAB/i)).toBeVisible();
  await page.getByLabel("Nome (quem é o advogado)").fill("Advogada de teste");
  await page.getByLabel("Número da OAB").fill("9876543");
  await page.getByLabel("Seccional (UF)").selectOption("BA");
  await page.getByRole("button", { name: /Monitorar esta OAB/i }).click();
  await expect(page.getByText(/OAB cadastrada/i)).toBeVisible();
  await expect(page.getByText("Advogada de teste")).toBeVisible();
  await expectRetiredApi(page.request, "/api/cron/djen", "POST");
});
