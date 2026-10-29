import { expect, test, type Page } from "@playwright/test";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);

async function register(page: Page, label: string) {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Pessoa ${label}${id}`);
  await page.getByLabel("E-mail").fill(`${label}-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca ${label} ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Bom dia/ })).toBeVisible();
  return id;
}

async function newCase(page: Page, title: string) {
  await page.goto("/processos/novo");
  await page.getByLabel("Título do caso ou processo").fill(title);
  await page.getByRole("button", { name: "Cadastrar caso ou processo" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  return page.url();
}

test("3.0-F1: campos personalizados, notas fixas, acervo, cadastro de partes e nota em lote", async ({ page }) => {
  const id = await register(page, "l3f1");

  // ---- campo personalizado criado em Configurações ----
  await page.goto("/configuracoes/campos");
  await page.getByLabel("Nome do campo").fill("Pasta física");
  await page.getByRole("button", { name: "Criar campo" }).click();
  await expect(page.getByTestId("custom-field-row")).toContainText("Pasta física");

  // ---- processo: preenche o campo ----
  const url1 = await newCase(page, `Caso um ${id}`);
  await page.getByLabel("Pasta física").fill("PF-777");
  await page.getByRole("button", { name: "Salvar campos" }).click();
  await expect(page.getByText("Campos salvos.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Pasta física")).toHaveValue("PF-777");

  // ---- notas: a fixada fica no topo ----
  await page.goto(`${url1}?aba=notas`);
  await page.getByLabel("Nota", { exact: true }).fill("Primeira nota comum");
  await page.getByRole("button", { name: "Salvar nota" }).click();
  await expect(page.getByTestId("case-note")).toHaveCount(1);
  await page.getByLabel("Título (opcional)").fill("Urgente");
  await page.getByLabel("Nota", { exact: true }).fill("Nota fixada importante");
  await page.getByLabel("Fixar no topo").check();
  await page.getByRole("button", { name: "Salvar nota" }).click();
  await expect(page.getByTestId("case-note")).toHaveCount(2);
  await expect(page.getByTestId("case-note").first()).toContainText("Nota fixada importante");

  // ---- acervo ----
  await page.goto(url1);
  await page.getByRole("button", { name: "Mover para o acervo" }).click();
  await expect(page.getByRole("button", { name: "Devolver à carteira ativa" })).toBeVisible();
  await page.goto("/processos");
  await expect(page.getByText(`Caso um ${id}`)).toHaveCount(0);
  await page.getByTestId("acervo-link").click();
  await expect(page.getByText(`Caso um ${id}`)).toBeVisible();
  await page.goto(url1);
  await page.getByRole("button", { name: "Devolver à carteira ativa" }).click();
  await expect(page.getByRole("button", { name: "Mover para o acervo" })).toBeVisible();

  // ---- cadastro único de partes ----
  await page.goto("/partes");
  await page.getByRole("button", { name: "Nova parte" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Banco do Teste S.A.");
  await page.getByRole("button", { name: "Cadastrar parte" }).click();
  await expect(page.getByTestId("registry-row")).toContainText("Banco do Teste S.A.");

  // reaproveita no processo
  await page.goto(`${url1}?aba=partes`);
  await page.getByRole("button", { name: "Adicionar parte" }).click();
  await page.getByPlaceholder("Buscar no cadastro de partes…").fill("Banco do");
  await page.getByRole("button", { name: /Banco do Teste S\.A\./ }).click();
  await page.getByRole("button", { name: "Adicionar parte" }).last().click();
  await expect(page.getByText("Banco do Teste S.A.").first()).toBeVisible();

  // ---- nota em lote ----
  const url2 = await newCase(page, `Caso dois ${id}`);
  await page.goto("/processos/nota-em-lote");
  await page.getByLabel(new RegExp(`Caso um ${id}`)).check();
  await page.getByLabel(new RegExp(`Caso dois ${id}`)).check();
  await page.getByLabel("Nota", { exact: true }).fill("Aviso para toda a carteira");
  await page.getByRole("button", { name: "Aplicar em 2 processo(s)" }).click();
  await expect(page.getByText("Nota aplicada em 2 processo(s).")).toBeVisible();
  await page.goto(`${url2}?aba=notas`);
  await expect(page.getByTestId("case-note")).toContainText("Aviso para toda a carteira");
  await expect(page.getByTestId("case-note")).toContainText("Aplicada em lote");
});
