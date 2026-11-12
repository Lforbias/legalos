import { expectRetired } from "./box-retired-checks";
import { expect, test } from "@playwright/test";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);

test("Evolution mantém navegação de trabalho sem atalhos do Box retirado", async ({ page }) => {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona box${id}`);
  await page.getByLabel("E-mail").fill(`dona-box-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca box ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Bom dia/ })).toBeVisible();

  // Menu da Evolution sem os atalhos do Box retirado
  const shell = page.locator("[data-space]").first();
  await expect(shell).toHaveAttribute("data-space", "evolution");
  const funcNav = page.getByRole("navigation", { name: "Navegação Evolution" });
  await funcNav.getByRole("button", { name: "Jurídico", exact: true }).click();
  await expect(funcNav.getByRole("link", { name: /^Processos/ })).toBeVisible();
  await funcNav.getByRole("button", { name: "Controladoria", exact: true }).click();
  await expect(funcNav.getByRole("link", { name: /Caixa de entrada/ })).toHaveCount(0);
  await expect(funcNav.getByRole("link", { name: /Certificados/ })).toHaveCount(0);
  await expect(page.getByTestId("func-to-box")).toHaveCount(0);
  await expect(page.getByTestId("space-box")).toHaveCount(0);
  await expectRetired(page.request, ["/box", "/caixa-de-entrada", "/certificados"]);
});
