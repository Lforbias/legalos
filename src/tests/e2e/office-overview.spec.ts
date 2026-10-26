import { expect, test } from "@playwright/test";

test("visão geral orienta a gestão do escritório e funciona no celular", async ({ page }) => {
  const id = Math.random().toString(36).slice(2, 9);
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill("Gestora do escritório");
  await page.getByLabel("E-mail").fill(`gestao-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill("SenhaForte123");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await page.getByLabel("Nome do escritório").fill(`Escritório gestão ${id}`);
  await page.getByRole("button", { name: "Criar escritório", exact: true }).click();
  await expect(page.getByRole("heading", { name: "O que precisa da sua atenção" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Financeiro do escritório" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Distribuição de trabalho da equipe" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Atividade do escritório (14 dias)" })).toHaveCount(0);
  await expect(page.getByText("Módulos em implantação", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /A receber em aberto/ })).toHaveAttribute("href", "/financeiro/lancamentos?tipo=receber&status=aberto");
  await expect(page.getByRole("link", { name: "Ver produtividade", exact: true })).toHaveAttribute("href", "/equipe");
  await page.screenshot({ path: "/tmp/legalos-gestao-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/legalos-gestao-mobile.png", fullPage: true });
  await page.getByRole("link", { name: /A receber em aberto/ }).click();
  await expect(page).toHaveURL(/tipo=receber&status=aberto/);
  await expect(page.getByRole("combobox", { name: "Tipo", exact: true })).toHaveValue("receber");
});
