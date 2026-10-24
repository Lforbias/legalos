import { expect, test } from "@playwright/test";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);

test("LegalOS Func e Box: alternador, painéis distintos, menus separados e atalhos entre os lados", async ({ page }) => {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona box${id}`);
  await page.getByLabel("E-mail").fill(`dona-box-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca box ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();

  // Func: menu de gestão, sem os itens do Box
  const shell = page.locator("[data-space]").first();
  await expect(shell).toHaveAttribute("data-space", "func");
  const funcNav = page.getByRole("navigation", { name: "Navegação Func" }).first();
  await expect(funcNav.getByRole("link", { name: /^Processos/ })).toBeVisible();
  await expect(funcNav.getByRole("link", { name: /Caixa de entrada/ })).toHaveCount(0);
  await expect(funcNav.getByRole("link", { name: /Certificados/ })).toHaveCount(0);
  await expect(page.getByTestId("func-to-box")).toBeVisible();

  // Vai para o Box pelo alternador
  await page.getByTestId("space-box").first().click();
  await expect(page).toHaveURL(/\/box$/);
  await expect(page.getByTestId("box-dashboard")).toBeVisible();
  await expect(page.locator("[data-space]").first()).toHaveAttribute("data-space", "box");
  const boxNav = page.getByRole("navigation", { name: "Navegação Box" }).first();
  await boxNav.getByRole("button", { name: "Conexões", exact: true }).click();
  for (const n of [/Caixa de entrada/, /Certificados/, /Integrações/]) await expect(boxNav.getByRole("link", { name: n }).first()).toBeVisible();
  await expect(boxNav.getByRole("link", { name: /^Processos/ })).toHaveCount(0);

  // Subpágina do Box continua no Box; atalho de volta ao Func
  await boxNav.getByRole("link", { name: /Caixa de entrada/ }).first().click();
  await expect(page.locator("[data-space]").first()).toHaveAttribute("data-space", "box");
  await page.getByTestId("space-func").first().click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();

  // Link direto do painel do Box ao Func
  await page.goto("/box");
  await page.getByTestId("box-to-func").click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();
});
