import { expectRetired, expectRetiredApi } from "./box-retired-checks";
import { expect, test } from "@playwright/test";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);

test("Integrações oculta o conector PJe (MNI) retirado", async ({ page }) => {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona mni${id}`);
  await page.getByLabel("E-mail").fill(`dona-mni-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca mni ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Bom dia/ })).toBeVisible();

  await page.goto("/integracoes");
  await expect(page.getByText("Conexões de tribunais — MNI 2.2.2")).toHaveCount(0);
  await expectRetired(page.request, ["/integracoes/pje"]);
  await expect(page.getByRole("button", { name: "Cadastrar conexão" })).toHaveCount(0);
});

test("Integrações não oferece captura DJEN e a rota antiga está desativada", async ({ page }) => {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona captura${id}`);
  await page.getByLabel("E-mail").fill(`dona-captura-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca captura ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Bom dia/ })).toBeVisible();

  await page.goto("/integracoes");
  await expect(page.getByText(/DJEN|publicações por OAB/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Monitorar esta OAB/i })).toHaveCount(0);
  await expectRetiredApi(page.request, "/api/cron/djen", "POST");
});
