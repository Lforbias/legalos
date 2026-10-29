import { expect, test } from "@playwright/test";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);

test("avisos no celular: o cartão aparece em Minha conta; sem chaves no servidor avisa a TI e não deixa ligar nem ativar", async ({ page }) => {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona push${id}`);
  await page.getByLabel("E-mail").fill(`dona-push-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca push ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Bom dia/ })).toBeVisible();

  await page.goto("/conta");
  const card = page.getByTestId("push-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("nunca mostra nome de cliente nem número de processo");
  await expect(page.getByTestId("push-not-configured")).toContainText("docs/push.md");
  await expect(page.getByTestId("push-device-status")).toHaveText("Desativado");
  await expect(page.getByTestId("push-enable")).toBeDisabled();
  await expect(page.getByTestId("push-org-panel")).toBeVisible();
  await expect(page.getByTestId("push-org-status")).toHaveText("Desligado");
  await expect(page.getByTestId("push-org-panel").getByRole("button", { name: "Ligar" })).toBeDisabled();

  // preferências salvam
  await page.getByLabel("Avisar quando faltarem até").selectOption("2");
  await card.getByRole("button", { name: "Salvar preferências" }).click();
  await expect(card.getByText("Preferências salvas.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Avisar quando faltarem até")).toHaveValue("2");
});
