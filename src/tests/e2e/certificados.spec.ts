import { expect, test } from "@playwright/test";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);

test("Cofre de certificados sem chave de cifra: avisa e não oferece envio; está no menu", async ({ page }) => {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona cert${id}`);
  await page.getByLabel("E-mail").fill(`dona-cert-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca cert ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();

  await page.getByTestId("space-box").first().click();
  await expect(page.getByTestId("box-dashboard")).toBeVisible();
  await page.getByRole("link", { name: /Certificados digitais/ }).first().click();
  await expect(page.getByRole("heading", { name: "Certificados digitais" })).toBeVisible();
  await expect(page.getByText(/CERT_ENCRYPTION_KEY/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar certificado" })).toHaveCount(0);
});
