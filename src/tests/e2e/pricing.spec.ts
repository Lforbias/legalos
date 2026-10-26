import { expect, test } from "@playwright/test";

test("public pricing compares sources, searches the catalogue and reaches the four unpriced plans", async ({ page }) => {
  const response = await page.goto("/produto/precos");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Antes do preço");
  for (const id of ["legalmail", "advbox", "astrea", "chatguru"]) {
    const card = page.getByTestId(`competitor-${id}`);
    const img = card.getByRole("img");
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    await expect(card.getByRole("link", { name: "Conferir fonte oficial" })).toHaveAttribute("href", /^https:\/\//);
  }
  await expect(page.getByTestId("competitor-chatguru")).toContainText("Não calculável");
  await expect(page.getByTestId("competitor-astrea")).toContainText("equivalente / mês");
  const catalogue = page.getByTestId("pricing-catalogue");
  await expect(catalogue.getByRole("status")).toHaveText("300 de 300 recursos e operações");
  await page.getByRole("searchbox", { name: "Buscar recurso" }).fill("campanha");
  await expect(catalogue.getByText("Criar campanha com até 10 mil destinatários")).toBeVisible();
  await expect(catalogue.getByText("Cadastrar cliente", { exact: true })).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Buscar recurso" }).fill("zzzzsemresultado");
  await expect(catalogue.getByText(/Nenhum recurso encontrado/)).toBeVisible();
  await page.getByRole("searchbox", { name: "Buscar recurso" }).clear();
  await page.getByRole("combobox", { name: "Filtrar área de recursos" }).selectOption({ label: "LegalOS Desktop" });
  await expect(catalogue.getByRole("status")).toHaveText("2 de 300 recursos e operações");
  await page.getByRole("combobox", { name: "Filtrar área de recursos" }).selectOption("all");
  await page.getByRole("link", { name: "Ver planos LegalOS", exact: true }).click();
  await expect(page).toHaveURL(/#planos$/);
  const plans = page.getByTestId("legalos-plans");
  await expect(plans.getByText("Em definição", { exact: true })).toHaveCount(4);
  for (const name of ["Simples", "Básico", "Intermediário", "Avançado"]) await expect(plans.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(plans.getByText(/R\$/)).toHaveCount(0);
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  }
  await page.goto("/produto/precos");
  await page.screenshot({ path: "/tmp/legalos-precos.png", fullPage: true, animations: "disabled" });
  await plans.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/legalos-precos-planos.png", animations: "disabled" });
});
