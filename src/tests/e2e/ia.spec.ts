import { expect, test } from "@playwright/test";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);

test("IA sem chave configurada: avisa com clareza, não simula resposta e está no menu e no processo", async ({ page }) => {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona ia${id}`);
  await page.getByLabel("E-mail").fill(`dona-ia-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca ia ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();

  await page.goto("/processos/novo");
  await page.getByLabel("Título do processo").fill(`Caso IA ${id}`);
  await page.getByRole("button", { name: "Cadastrar processo" }).click();
  await expect(page.getByRole("heading", { name: `Caso IA ${id}` })).toBeVisible();
  await page.getByRole("link", { name: "Perguntar à IA" }).click();
  await expect(page.getByRole("heading", { name: "Assistente de IA" })).toBeVisible();
  await expect(page.getByText(/falta a chave do provedor/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Perguntar" })).toHaveCount(0);
  await expect(page.getByTestId("ai-usage")).toContainText("0 de 500.000 tokens");
  await expect(page.getByText(/não ficam gravadas|não fica gravada|A pergunta e a resposta não ficam gravadas/)).toBeVisible();

  await page.getByRole("link", { name: /Inteligência artificial/ }).first().click();
  await expect(page.getByRole("heading", { name: "Assistente de IA" })).toBeVisible();
});
