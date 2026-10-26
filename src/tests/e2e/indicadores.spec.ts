import { expect, test } from "@playwright/test";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);

test("indicadores e central de alertas: abrem para o dono, abas navegam e o escritório novo mostra tudo zerado (sem número inventado)", async ({ page }) => {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona ind${id}`);
  await page.getByLabel("E-mail").fill(`dona-ind-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca ind ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();

  // Menu lateral leva às duas páginas.
  await page.getByRole("button", { name: "Gestão do escritório", exact: true }).click();
  await page.getByRole("link", { name: "Indicadores" }).first().click();
  await expect(page.getByTestId("indicators-page")).toBeVisible();
  await expect(page.getByTestId("ind-overdue-tasks")).toContainText("0");
  await expect(page.getByTestId("ind-overdue-receivable")).toContainText("0");
  await expect(page.getByTestId("ind-movement")).toBeVisible();
  await expect(page.getByTestId("ind-evolution").locator("> div")).toHaveCount(12);
  await expect(page.getByText("Nenhum processo ativo com cliente vinculado.")).toBeVisible();

  await page.getByRole("link", { name: "Central de alertas" }).first().click();
  await expect(page.getByTestId("alerts-page")).toBeVisible();
  await expect(page.getByTestId("alerts-empty")).toContainText("Nenhuma publicação nova");
  await page.getByRole("navigation", { name: "Seções" }).getByRole("link", { name: /^Tarefas/ }).click();
  await expect(page).toHaveURL(/aba=tarefas/);
  await expect(page.getByTestId("alerts-empty")).toContainText("Nenhuma tarefa atrasada");
  await page.getByRole("navigation", { name: "Seções" }).getByRole("link", { name: /^Financeiro/ }).click();
  await expect(page.getByTestId("alerts-empty")).toContainText("Nenhum lançamento vencido");
  // Aba inexistente cai na primeira permitida, sem erro.
  await page.goto("/alertas?aba=naoexiste");
  await expect(page.getByTestId("alerts-empty")).toContainText("Nenhuma publicação nova");
});
