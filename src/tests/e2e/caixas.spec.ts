import { expect, test } from "@playwright/test";

const password = "SenhaForte123";
const plusDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 8);

test("caixas: equipe, distribuir à equipe, nota, etiqueta, adormecer e acervo", async ({ page }) => {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona cx${id}`);
  await page.getByLabel("E-mail").fill(`dona-cxf-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca cxf ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();

  // equipe
  await page.goto("/caixa-de-entrada/equipes");
  await page.getByLabel("Nova equipe").fill(`Trabalhista ${id}`);
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Criar equipe" }).click();
  await expect(page.getByText(`Trabalhista ${id}`).first()).toBeVisible();

  // intimação
  await page.goto("/caixa-de-entrada/nova");
  await page.getByLabel("Título", { exact: true }).fill(`Intimação ${id}`);
  await page.getByLabel("Texto", { exact: true }).fill(`Fica a parte intimada para se manifestar. Ref ${id}`);
  await page.getByLabel("Data de recebimento").fill("2030-03-01");
  await page.getByRole("button", { name: "Registrar intimação" }).click();
  await expect(page.getByRole("heading", { name: `Intimação ${id}` })).toBeVisible();
  const url = page.url();

  // nota e etiqueta
  await page.getByLabel("Nova nota").fill("Ligar para o cliente.");
  await page.getByRole("button", { name: "Adicionar nota" }).click();
  await expect(page.getByText("Ligar para o cliente.")).toBeVisible();
  await page.getByLabel("Etiquetas").fill("urgente");
  await page.getByRole("button", { name: "Salvar etiquetas" }).click();
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(page.getByLabel("Etiquetas")).toHaveValue("urgente");

  // equipe
  await page.getByLabel("Equipe", { exact: true }).selectOption({ label: `Trabalhista ${id}` });
  await page.getByRole("button", { name: "Enviar à equipe" }).click();
  await expect(page.getByText(`Equipe Trabalhista ${id}`).first()).toBeVisible();

  // aparece na caixa da equipe e filtra por etiqueta
  await page.goto("/caixa-de-entrada");
  await page.getByRole("link", { name: new RegExp(`^Trabalhista ${id}`) }).click();
  await expect(page.getByRole("link", { name: `Intimação ${id}` })).toBeVisible();
  await expect(page.getByRole("cell").getByText("urgente")).toBeVisible();

  // adormecer: sai da caixa e vai para Adormecidas
  await page.goto(url);
  await page.getByLabel("Adormecer até").fill(plusDays(30));
  await page.getByRole("button", { name: "Adormecer", exact: true }).click();
  await expect(page.getByText(/Adormecida até/)).toBeVisible();
  await page.goto("/caixa-de-entrada?caixa=adormecidas");
  await expect(page.getByRole("link", { name: `Intimação ${id}` })).toBeVisible();
  await page.goto("/caixa-de-entrada?caixa=entrada");
  await expect(page.getByRole("link", { name: `Intimação ${id}` })).toHaveCount(0);

  // tratar → acervo
  await page.goto(url);
  await page.getByRole("button", { name: "Marcar como tratada" }).click();
  await expect(page.getByText("Tratada", { exact: true }).first()).toBeVisible();
  await page.goto("/caixa-de-entrada?caixa=acervo");
  await expect(page.getByRole("link", { name: `Intimação ${id}` })).toBeVisible();
});
