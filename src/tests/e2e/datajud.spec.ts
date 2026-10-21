import { expect, test } from "@playwright/test";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);

test("DataJud sem chave: página de integrações avisa, não oferece ligar e o processo não mostra o botão", async ({ page }) => {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona dj${id}`);
  await page.getByLabel("E-mail").fill(`dona-dj-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca dj ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();

  await page.getByTestId("space-box").first().click();
  await expect(page.getByTestId("box-dashboard")).toBeVisible();
  await page.getByRole("link", { name: /Integrações/ }).first().click();
  await expect(page.getByRole("heading", { name: "Integrações" })).toBeVisible();
  await expect(page.getByText(/DATAJUD_API_KEY/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Ligar DataJud/ })).toHaveCount(0);

  await page.goto("/processos/novo");
  await page.getByLabel("Título do processo").fill(`Caso DJ ${id}`);
  await page.getByRole("button", { name: "Cadastrar processo" }).click();
  await expect(page.getByRole("heading", { name: `Caso DJ ${id}` })).toBeVisible();
  await expect(page.getByRole("button", { name: "Consultar DataJud" })).toHaveCount(0);
});
