import { expect, test } from "@playwright/test";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);

test("Box 2.0 desligado (padrão): as telas novas não existem e o Box antigo segue igual", async ({ page }) => {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona off ${id}`);
  await page.getByLabel("E-mail").fill(`dona-off-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca off ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  for (const path of ["/box/conexoes", "/box/saude", "/box/processos", "/box/configuracoes", "/box/configurar"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
  }
  // o canal de atualização ao vivo também não existe, mesmo para quem está logado
  const events = await page.request.get("/api/box/events");
  expect(events.status()).toBe(404);
  expect(events.headers()["content-type"] ?? "").not.toContain("text/event-stream");

  // a caixa de entrada antiga segue sem as novidades do Box 2.0
  await page.goto("/caixa-de-entrada");
  await expect(page.getByRole("heading", { name: "Caixa de entrada jurídica" })).toBeVisible();
  await expect(page.getByTestId("live-status")).toHaveCount(0);
  await expect(page.getByTestId("day-unviewed")).toHaveCount(0);

  await page.goto("/box");
  await expect(page.getByTestId("box-dashboard")).toBeVisible();
  await expect(page.getByTestId("setup-card")).toHaveCount(0);
  await expect(page.getByText("Sua fila de trabalho")).toBeVisible();
});
