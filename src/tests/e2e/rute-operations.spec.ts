import { expect, test } from "@playwright/test";

test("RUTE permanece desativada na interface e nas rotas autenticadas", async ({ page }) => {
  const id = Math.random().toString(36).slice(2, 9);
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Pessoa ${id}`);
  await page.getByLabel("E-mail").fill(`rute-off-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill("SenhaForte123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Escritório ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Bom dia/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Abrir RUTE" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "RUTE (IA)" })).toHaveCount(0);
  await page.goto("/rute");
  await expect(page.getByRole("heading", { name: "RUTE desativada" })).toBeVisible();
  const skill = await page.request.get("/api/rute/skill");
  expect(skill.status()).toBe(410);
  const governance = await page.request.get("/api/rute/lgpd");
  expect(governance.status()).toBe(410);
  await page.goto("/atendimento");
  await expect(page.getByText("Copiloto, macros e dados do atendimento", { exact: true })).toHaveCount(0);
});
