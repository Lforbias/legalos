import { expect, test, type Page } from "@playwright/test";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);
const pdf = (tag: string) => Buffer.from(`%PDF-1.4\n% ${tag}\n%%EOF`);

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

async function newCase(page: Page, title: string, clientName: string) {
  await page.goto("/processos/novo");
  await page.getByLabel("Título do processo").fill(title);
  await page.getByPlaceholder("Buscar cliente pelo nome…").fill(clientName.slice(0, 8));
  await page.getByRole("button", { name: new RegExp(clientName) }).click();
  await page.getByRole("button", { name: "Cadastrar processo" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  return page.url();
}

test("CRM → cliente → automação → portal do cliente com compartilhamento e isolamento", async ({ page, browser }) => {
  const id = await signUpWithOffice(page, "p");
  const leadName = `Lead ${id}`;

  // ---- automação: lead ganho gera tarefa ----
  await page.goto("/automacoes/nova");
  await page.getByLabel("Nome da regra").fill(`Boas-vindas ${id}`);
  await page.getByLabel("Gatilho").selectOption("LEAD_WON");
  await page.getByLabel("Título da tarefa criada").fill("Onboarding de {{gatilho}}");
  await page.getByRole("button", { name: /Criar regra|Salvar/ }).click();
  await expect(page.getByText(`Boas-vindas ${id}`)).toBeVisible();

  // ---- lead → proposta → conversão ----
  await page.goto("/crm/novo");
  await page.getByRole("button", { name: "Cadastrar lead" }).click();
  await expect(page.getByText("Informe o nome.")).toBeVisible();
  await page.getByLabel("Nome", { exact: true }).fill(leadName);
  await page.getByLabel("E-mail").fill(`lead-${id}@example.test`);
  await page.getByRole("button", { name: "Cadastrar lead" }).click();
  await expect(page.getByRole("heading", { name: leadName })).toBeVisible();

  await page.getByRole("link", { name: "Nova proposta" }).click();
  await page.getByLabel("Título").fill(`Honorários ${id}`);
  await page.getByLabel("Valor (R$)").fill("2.500,00");
  await page.getByRole("button", { name: "Criar proposta" }).click();
  await expect(page.getByText(`Honorários ${id}`).first()).toBeVisible();
  await page.getByRole("button", { name: "Marcar como enviada" }).click();
  await expect(page.getByRole("button", { name: "Aceita" })).toBeVisible();
  await page.getByRole("button", { name: "Aceita" }).click();
  await expect(page.getByText("Aceita").first()).toBeVisible();

  await page.getByLabel(/Converter em cliente/).fill("111.111.111-11");
  await page.getByRole("button", { name: "Converter em cliente" }).click();
  await expect(page.locator("#conv-doc-error")).toHaveText("CPF inválido.");
  await page.getByLabel(/Converter em cliente/).fill("");
  await page.getByRole("button", { name: "Converter em cliente" }).click();
  await page.waitForURL(/\/clientes\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: leadName })).toBeVisible();
  const clientUrl = page.url().split("?")[0]!;

  // automação criou a tarefa do cliente
  await page.goto("/tarefas");
  await expect(page.getByText(`Onboarding de ${leadName}`)).toBeVisible();

  // ---- processos: um compartilhado, um interno ----
  const sharedUrl = await newCase(page, `Compartilhado ${id}`, leadName);
  await page.goto(`${sharedUrl}?aba=documentos`);
  await page.locator("#document-file").setInputFiles({ name: "visivel.pdf", mimeType: "application/pdf", buffer: pdf("visivel") });
  await expect(page.getByText("visivel.pdf")).toBeVisible();
  await page.locator("#document-file").setInputFiles({ name: "interno.pdf", mimeType: "application/pdf", buffer: pdf("interno") });
  await expect(page.getByText("interno.pdf")).toBeVisible();
  const internalUrl = await newCase(page, `Interno ${id}`, leadName);

  await page.goto(sharedUrl);
  await page.getByRole("button", { name: "Compartilhar com o portal do cliente" }).click();
  await expect(page.getByRole("button", { name: "Parar de compartilhar com o portal" })).toBeVisible();
  await page.goto(`${sharedUrl}?aba=documentos`);
  await page.getByRole("link", { name: "visivel.pdf" }).first().click();
  await page.getByRole("button", { name: "Compartilhar com o portal do cliente" }).click();
  await expect(page.getByRole("button", { name: "Remover do portal" })).toBeVisible();

  // ---- convite ao portal ----
  const clientEmail = `cliente-${id}@example.test`;
  await page.goto(`${clientUrl}?aba=portal`);
  await page.getByLabel("Convidar por e-mail").fill(clientEmail);
  await page.getByRole("button", { name: "Enviar convite" }).click();
  await expect(page.getByText(/envio de e-mail não está configurado/)).toBeVisible();
  const link = (await page.getByTestId("portal-invite-link").innerText()).trim();
  expect(link).toContain("/accept-invite?token=");
  await expect(page.getByText("convite pendente")).toBeVisible();

  // ---- cliente entra pelo convite e vê somente o compartilhado ----
  const cctx = await browser.newContext({ baseURL: page.url().split("/clientes")[0] });
  const cp = await cctx.newPage();
  await cp.goto(link);
  await cp.getByRole("link", { name: "Criar conta para aceitar" }).click();
  await cp.getByLabel("Nome completo").fill(`Cliente ${id}`);
  await cp.getByLabel("Senha", { exact: true }).fill(password);
  await cp.getByRole("button", { name: "Criar conta" }).click();
  await expect(cp.getByRole("heading", { name: "Seus processos e documentos" })).toBeVisible();
  await expect(cp.getByRole("link", { name: `Compartilhado ${id}` })).toBeVisible();
  await expect(cp.getByText(`Interno ${id}`)).toHaveCount(0);
  await expect(cp.getByText("visivel.pdf")).toBeVisible();
  await expect(cp.getByText("interno.pdf")).toHaveCount(0);

  const href = await cp.getByRole("link", { name: "Baixar visivel.pdf" }).getAttribute("href");
  const res = await cp.request.get(href as string);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("attachment");
  expect((await res.body()).toString()).toContain("%PDF-1.4");

  // área da equipe fechada para o cliente
  await cp.goto("/clientes");
  await expect(cp).toHaveURL(/\/portal/);
  await cp.goto(internalUrl);
  await expect(cp).toHaveURL(/\/portal/);
  await cp.goto("/crm");
  await expect(cp).toHaveURL(/\/portal/);

  // descompartilhar esconde imediatamente
  await page.goto(sharedUrl);
  await page.getByRole("button", { name: "Parar de compartilhar com o portal" }).click();
  await expect(page.getByRole("button", { name: "Compartilhar com o portal do cliente" })).toBeVisible();
  await cp.goto("/portal");
  await expect(cp.getByText(`Compartilhado ${id}`)).toHaveCount(0);

  // revogar acesso
  await page.goto(`${clientUrl}?aba=portal`);
  await page.getByRole("button", { name: "Revogar", exact: true }).click();
  await page.getByRole("button", { name: "Revogar acesso" }).click();
  await expect(page.getByText("Ninguém com acesso ao portal.")).toBeVisible();
  await cp.goto("/portal");
  await expect(cp.getByText(/acesso ao portal não está ativo/)).toBeVisible();
  await cctx.close();
});
