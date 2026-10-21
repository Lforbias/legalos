import { expect, test, type Page } from "@playwright/test";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);

async function signUpWithOffice(page: Page, label: string) {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona ${label}${id}`);
  await page.getByLabel("E-mail").fill(`dona-${label}-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca ${label} ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();
  return id;
}

test("Financeiro: conta → parcelas → baixa parcial → estorno → cancelamento → visão geral e isolamento", async ({ page, browser }) => {
  const id = await signUpWithOffice(page, "f");

  // ---- cadastros ----
  await page.goto("/financeiro/cadastros");
  await page.getByLabel("Nome da conta").fill(`Conta ${id}`);
  await page.getByLabel("Saldo inicial (R$)").fill("1.000,00");
  await page.getByRole("button", { name: "Adicionar conta" }).click();
  await expect(page.getByText(`Conta ${id}`).first()).toBeVisible();

  // ---- sem valor: validação ----
  await page.goto("/financeiro/lancamentos/novo");
  await page.getByRole("button", { name: "Criar lançamento" }).click();
  await expect(page.getByText("Descreva o lançamento.")).toBeVisible();

  // ---- 3 parcelas de 100,00 (centavos distribuídos) ----
  await page.getByLabel("Descrição").fill(`Honorários ${id}`);
  await page.getByLabel(/Valor/).fill("100,00");
  await page.getByLabel("Parcelas").fill("3");
  await page.getByRole("button", { name: "Criar lançamento" }).click();
  await expect(page.getByTestId("entries-count")).toHaveText("3 lançamento(s)");
  await expect(page.getByText("parcela 1/3")).toBeVisible();

  // ---- baixa parcial na 1ª parcela ----
  await page.getByRole("link", { name: `Honorários ${id}` }).first().click();
  await expect(page.getByTestId("entry-amount")).toContainText("33,34");
  await page.getByLabel("Valor da baixa (R$)").fill("10,00");
  await page.getByRole("button", { name: "Registrar baixa" }).click();
  await expect(page.getByTestId("entry-status")).toHaveText("Parcial");
  await expect(page.getByTestId("entry-remaining")).toContainText("23,34");

  // excesso é recusado
  await page.getByLabel("Valor da baixa (R$)").fill("50,00");
  await page.getByRole("button", { name: "Registrar baixa" }).click();
  await expect(page.getByText(/O valor é maior que o saldo/)).toBeVisible();

  // ---- não cancela com baixa ativa; estorna e depois cancela ----
  await expect(page.getByText("Cancelamento indisponível enquanto houver baixas não estornadas.")).toBeVisible();
  await page.getByRole("button", { name: "Estornar" }).click();
  await page.getByPlaceholder("Motivo do estorno").fill("Lançada por engano");
  await page.getByRole("button", { name: "Confirmar estorno" }).click();
  await expect(page.getByTestId("entry-status")).toHaveText("Em aberto");
  await expect(page.getByText("Motivo: Lançada por engano")).toBeVisible();

  await page.getByRole("button", { name: "Cancelar lançamento" }).click();
  await page.getByPlaceholder("Motivo do cancelamento").fill("Acordo desfeito");
  await page.getByRole("button", { name: "Confirmar cancelamento" }).click();
  await expect(page.getByTestId("entry-status")).toHaveText("Cancelado");

  // ---- visão geral: só as 2 parcelas restantes (33,33 + 33,33) estão em aberto ----
  await page.goto("/financeiro");
  await expect(page.getByTestId("stat-receivable-open")).toContainText("66,66");
  await expect(page.getByTestId(`balance-Conta ${id}`)).toContainText("1.000,00");

  // ---- isolamento entre escritórios ----
  const url = "/financeiro/lancamentos";
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await signUpWithOffice(p2, "g");
  await p2.goto(url + "?status=todos");
  await expect(p2.getByText("Nenhum lançamento encontrado com estes filtros.")).toBeVisible();
  await other.close();
});
