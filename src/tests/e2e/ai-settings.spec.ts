import { expect, test } from "@playwright/test";

test("A configuração e os recursos da RUTE permanecem desativados", async ({ page }) => {
  const id = Math.random().toString(36).slice(2, 9);
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Pessoa IA ${id}`);
  await page.getByLabel("E-mail").fill(`ai-config-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill("SenhaForte123");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await page.getByLabel("Nome do escritório").fill(`Escritório IA ${id}`);
  await page.getByRole("button", { name: "Criar escritório", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Bom dia/ })).toBeVisible();
  await page.goto("/configuracoes");
  await expect(page.getByRole("link", { name: /^IA do escritório/ })).toHaveCount(0);
  await page.goto("/configuracoes/ia");
  await expect(page.getByRole("heading", { name: "Configuração de IA indisponível" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar configuração de IA" })).toHaveCount(0);
  await page.goto("/rute");
  await expect(page.getByRole("heading", { name: "RUTE desativada" })).toBeVisible();
});
