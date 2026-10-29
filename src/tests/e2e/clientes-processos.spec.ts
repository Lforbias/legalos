import { expect, test, type Page } from "@playwright/test";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);

/** Dígito verificador CNJ (módulo 97) — mesma regra do validador da aplicação. */
function cnj(seq: string) {
  const base = `${seq}2024826` + "0100";
  const dd = String(98n - (BigInt(`${base}00`) % 97n)).padStart(2, "0");
  return `${seq}-${dd}.2024.8.26.0100`;
}

async function signUpWithOffice(page: Page, label: string) {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona ${label}${id}`);
  await page.getByLabel("E-mail").fill(`dona-${label}-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca ${label} ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Bom dia/ })).toBeVisible();
  return id;
}

test("clientes e processos: validação, cadastro, linha do tempo, documento e isolamento", async ({ page, browser }) => {
  const id = await signUpWithOffice(page, "a");
  const clientName = `Cliente ${id}`;

  // ---- cliente: validação de CPF no formulário ----
  await page.getByRole("link", { name: /^Clientes/ }).first().click();
  await expect(page.getByText("Nenhum cliente cadastrado ainda.")).toBeVisible();
  await page.getByRole("link", { name: "Novo cliente" }).first().click();
  await page.getByLabel("Nome completo").fill(clientName);
  await page.getByLabel("CPF", { exact: true }).fill("111.111.111-11");
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page.getByText("CPF inválido.")).toBeVisible();
  await page.getByLabel("CPF", { exact: true }).fill("529.982.247-25");
  await page.getByLabel("Etiquetas").fill("vip, trabalhista");
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page.getByRole("heading", { name: clientName })).toBeVisible();
  await expect(page.getByText("529.982.247-25").first()).toBeVisible();

  // CPF duplicado é recusado
  await page.goto("/clientes/novo");
  await page.getByLabel("Nome completo").fill("Outra pessoa");
  await page.getByLabel("CPF", { exact: true }).fill("52998224725");
  await page.getByRole("button", { name: "Cadastrar cliente" }).click();
  await expect(page.getByText(/Já existe um cliente com este documento/)).toBeVisible();

  // ---- processo: número CNJ inválido, depois válido, vinculado ao cliente ----
  await page.goto("/processos/novo");
  await page.getByLabel("Título do caso ou processo").fill(`Ação ${id}`);
  await page.getByLabel("Número CNJ").fill("0000001-00.2024.8.26.0100");
  await page.getByRole("button", { name: "Cadastrar caso ou processo" }).click();
  await expect(page.getByText(/Número CNJ inválido/)).toBeVisible();
  await page.getByLabel("Número CNJ").fill(cnj("0000001"));
  await page.getByPlaceholder("Buscar cliente pelo nome…").fill(clientName.slice(0, 8));
  await page.getByRole("button", { name: new RegExp(clientName) }).click();
  await page.getByLabel("Processo sigiloso").check();
  await page.getByRole("button", { name: "Cadastrar caso ou processo" }).click();
  await expect(page.getByRole("heading", { name: `Ação ${id}` })).toBeVisible();
  await expect(page.getByText("Sigiloso").first()).toBeVisible();
  const caseUrl = page.url();

  // partes: o cliente foi vinculado
  await page.getByRole("link", { name: /^Partes/ }).click();
  await expect(page.getByRole("link", { name: clientName })).toBeVisible();
  await expect(page.getByText("Nosso cliente")).toBeVisible();

  // linha do tempo: anotação interna e mudança de situação (automática)
  await page.getByRole("link", { name: "Linha do tempo" }).click();
  await page.getByLabel("Anotação", { exact: true }).fill("Cliente enviou os documentos pelo WhatsApp.");
  await page.getByRole("button", { name: "Registrar anotação" }).click();
  await expect(page.getByText("Cliente enviou os documentos pelo WhatsApp.")).toBeVisible();
  await expect(page.getByText("Registro interno").first()).toBeVisible();
  await expect(page.getByText("Processo cadastrado no sistema")).toBeVisible();
  await page.goto(`${caseUrl}`);
  await page.getByLabel("Situação do processo").selectOption("SUSPENDED");
  await page.getByRole("link", { name: "Linha do tempo" }).click();
  await expect(page.getByText('Situação alterada para "Suspenso"')).toBeVisible();
  // filtro por origem: nada foi importado de tribunal
  await page.getByRole("link", { name: "Importados do tribunal" }).click();
  await expect(page.getByText("Nenhum evento para este filtro.")).toBeVisible();

  // ---- documento: tipo inválido recusado; PDF aceito e baixado ----
  await page.goto(`${caseUrl}?aba=documentos`);
  await page.locator("#document-file").setInputFiles({ name: "virus.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") });
  await expect(page.getByText(/Formatos aceitos/)).toBeVisible();
  await page.locator("#document-file").setInputFiles({ name: "peticao.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% conteúdo de teste\n") });
  await expect(page.getByText("peticao.pdf")).toBeVisible();
  const href = await page.getByRole("link", { name: "Baixar peticao.pdf" }).getAttribute("href");
  const res = await page.request.get(href as string);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("attachment");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect((await res.body()).toString()).toContain("%PDF-1.4");

  // ---- listas, busca e quadro ----
  await page.goto("/processos?visao=quadro");
  await expect(page.getByRole("region", { name: "Suspenso" }).getByText(`Ação ${id}`)).toBeVisible();
  await page.goto("/processos");
  await page.getByLabel("Buscar por número, título ou parte").fill(cnj("0000001").replace(/\D/g, ""));
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByRole("link", { name: new RegExp(`Ação ${id}`) })).toBeVisible();
  await page.getByLabel("Busca global").fill(clientName);
  await expect(page.getByRole("link", { name: new RegExp(clientName) }).last()).toBeVisible();

  // ---- isolamento: outro escritório recebe 404 para recursos do primeiro ----
  const otherCtx = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const other = await otherCtx.newPage();
  await signUpWithOffice(other, "b");
  expect((await other.request.get(href as string)).status()).toBe(404);
  const clientUrl = (await page.goto("/clientes").then(() => page.getByRole("link", { name: clientName }).getAttribute("href"))) as string;
  const caseResp = await other.goto(caseUrl);
  expect(caseResp?.status()).toBe(404);
  const clientResp = await other.goto(clientUrl);
  expect(clientResp?.status()).toBe(404);
  await other.goto("/clientes");
  await expect(other.getByText(clientName)).toHaveCount(0);
  await otherCtx.close();
});
