import { test, expect } from "@playwright/test";

test("implantação mostra as três etapas e os novos gatilhos de automação", async ({ page }) => {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill("Gestor da implantação");
  await page.getByLabel("E-mail", { exact: true }).fill(`implantacao-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill("SenhaForte123");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await page.getByLabel("Nome do escritório").fill(`Escritório de implantação ${id}`);
  await page.getByRole("button", { name: "Criar escritório", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await page.goto("/configuracoes");
  await page.getByRole("link", { name: /Implantação do escritório/ }).first().click();
  await expect(page.getByRole("heading", { name: "Implantação do escritório", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Etapa 1 — Operação processual" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Etapa 2 — Módulos conectados" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Etapa 3 — Adoção e acompanhamento" })).toBeVisible();
  await page.getByRole("link", { name: "Abrir automações entre módulos", exact: true }).click();
  await expect(page).toHaveURL(/\/automacoes$/);
  await page.goto("/automacoes/nova");
  await expect(page.getByLabel("Gatilho").locator("option")).toContainText(["Quando um processo for cadastrado", "Quando um prazo for validado", "Quando uma intimação for registrada", "Quando um lead virar cliente", "Quando uma tarefa for concluída", "Quando um documento for enviado"]);
  await page.goto("/ajuda");
  await page.getByRole("searchbox", { name: "Buscar na ajuda" }).fill("Instalar o aplicativo");
  await expect(page.getByRole("heading", { name: /Instalar o aplicativo no celular/ })).toBeVisible();
});
