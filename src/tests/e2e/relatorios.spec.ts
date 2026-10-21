import { expect, test } from "@playwright/test";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);

test("Relatórios: abas por permissão, período inválido é explicado e a planilha baixa em CSV", async ({ page }) => {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona rel${id}`);
  await page.getByLabel("E-mail").fill(`dona-rel-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca rel ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();

  await page.goto("/relatorios");
  await expect(page.getByRole("heading", { name: "Relatórios e BI" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Relatórios" });
  for (const aba of ["Prazos", "Intimações", "Processos", "Equipe", "Financeiro"]) {
    await expect(nav.getByRole("link", { name: aba })).toBeVisible();
  }

  await nav.getByRole("link", { name: "Financeiro" }).click();
  await expect(page).toHaveURL(/aba=financeiro/);
  await expect(page.getByText("Clientes que mais pagaram")).toBeVisible();
  for (const aba of ["Prazos", "Intimações", "Processos", "Equipe"]) {
    await nav.getByRole("link", { name: aba }).click();
    await expect(page.getByRole("heading", { name: "Relatórios e BI" })).toBeVisible();
  }

  await page.goto("/relatorios?aba=prazos&from=2020-01-01&to=2026-01-01");
  await expect(page.getByText(/Mostrando os últimos 90 dias/)).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-csv").click()]);
  expect(download.suggestedFilename()).toMatch(/^relatorio-prazos-\d{4}-\d{2}-\d{2}_a_\d{4}-\d{2}-\d{2}\.csv$/);

  const res = await page.request.get("/api/reports/export?tipo=inexistente");
  expect(res.status()).toBe(422);
});
