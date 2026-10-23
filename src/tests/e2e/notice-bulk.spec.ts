import { expect, test } from "@playwright/test";

test("Box: filtros e revisão de lote alteram apenas a seleção explícita", async ({ page }) => {
  const id = Math.random().toString(36).slice(2, 10);
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona lote ${id}`);
  await page.getByLabel("E-mail").fill(`lote-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill("SenhaForte123");
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca lote ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();

  for (const suffix of ["A", "B"]) {
    await page.goto("/caixa-de-entrada/nova");
    await page.getByLabel("Título", { exact: true }).fill(`Lote ${id} ${suffix}`);
    await page.getByLabel("Texto", { exact: true }).fill(`Intimação fictícia para teste do lote ${id} ${suffix}.`);
    await page.getByLabel("Data de recebimento").fill("2030-03-01");
    await page.getByLabel("Tipo", { exact: true }).selectOption("DECISAO");
    await page.getByRole("button", { name: "Registrar intimação" }).click();
    await expect(page.getByRole("heading", { name: `Lote ${id} ${suffix}` })).toBeVisible();
  }
  await page.goto("/caixa-de-entrada");
  const filters = page.getByRole("search", { name: "Filtrar intimações" });
  await filters.getByRole("textbox", { name: "Buscar", exact: true }).fill(`Lote ${id}`);
  await filters.getByRole("combobox", { name: "Tipo", exact: true }).selectOption("DECISAO");
  await filters.getByLabel("Recebida de", { exact: true }).fill("2030-03-01");
  await filters.getByLabel("Recebida até", { exact: true }).fill("2030-03-01");
  await filters.getByRole("button", { name: "Filtrar", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Paginação de intimações" })).toContainText("2 resultado(s)");
  // Leitor preserva filtros e permite tratar uma publicação sem abandonar a lista.
  await page.getByRole("link", { name: "Leitura integrada", exact: true }).click();
  const readingList = page.getByRole("navigation", { name: "Lista de leitura" });
  await readingList.getByRole("link").filter({ hasText: `Lote ${id} B` }).click();
  const reader = page.getByRole("region", { name: "Intimação selecionada" });
  await expect(reader.getByRole("heading", { name: `Lote ${id} B`, exact: true })).toBeVisible();
  await reader.getByLabel("Nova nota").fill("Conferida no leitor integrado.");
  await reader.getByRole("button", { name: "Adicionar nota", exact: true }).click();
  await expect(reader.getByText("Conferida no leitor integrado.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/tipo=DECISAO/);
  await expect(page).toHaveURL(/leitura=1/);
  await page.screenshot({ path: "/tmp/legalos-box-reader.png", fullPage: true });
  await page.getByRole("link", { name: "Ver tabela", exact: true }).click();
  await page.getByRole("checkbox", { name: `Selecionar Lote ${id} A`, exact: true }).check();
  await page.getByLabel("Ação em lote").selectOption("ADD_TAGS");
  await page.getByLabel(/Etiquetas a adicionar/).fill("revisar");
  await page.getByRole("button", { name: "Revisar lote", exact: true }).click();
  const review = page.getByRole("region", { name: "Revisão do lote" });
  await expect(review).toContainText(`Lote ${id} A`);
  await expect(review).not.toContainText(`Lote ${id} B`);
  await review.getByRole("button", { name: "Confirmar ação em lote" }).click();
  const table = page.getByRole("table", { name: "Intimações", exact: true });
  await expect(table.getByRole("row").filter({ hasText: `Lote ${id} A` })).toContainText("revisar");
  await expect(table.getByRole("row").filter({ hasText: `Lote ${id} B` })).not.toContainText("revisar");

  await page.getByRole("checkbox", { name: `Selecionar Lote ${id} A`, exact: true }).check();
  await page.getByLabel("Ação em lote").selectOption("PROCESS");
  await page.getByRole("button", { name: "Revisar lote", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar ação em lote" }).click();
  await expect(table.getByRole("link", { name: `Lote ${id} A`, exact: true })).toHaveCount(0);
  await expect(table.getByRole("link", { name: `Lote ${id} B`, exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Situação", exact: true }).getByRole("link", { name: /^Acervo/ }).click();
  await expect(table.getByRole("link", { name: `Lote ${id} A`, exact: true })).toBeVisible();
  await expect(page).toHaveURL(/tipo=DECISAO/);
});
