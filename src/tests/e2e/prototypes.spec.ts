import { expect, test } from "@playwright/test";
import { PROTOTYPES } from "@/modules/prototypes/registry";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);

test("protótipos: índice e todas as telas abrem com a faixa de aviso", async ({ page }) => {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Pessoa proto${id}`);
  await page.getByLabel("E-mail").fill(`proto-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca proto ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();

  await page.goto("/prototipos");
  await expect(page.getByRole("heading", { name: "Protótipos das próximas versões" })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Nada aqui é salvo");
  for (const p of PROTOTYPES) {
    await page.goto(`/prototipos/${p.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(p.title);
    await expect(page.getByRole("note").first()).toContainText("Protótipo");
  }
  await page.goto("/prototipos/9.9-F9");
  await expect(page.getByText(/não encontrad|404/i).first()).toBeVisible();
});
