import { expect, test, type Page } from "@playwright/test";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);
// PNG 2x1
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGP8z8Dwn4EBAAkEAQDrUbkRAAAAAElFTkSuQmCC", "base64");

async function register(page: Page, label: string) {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Pessoa ${label}${id}`);
  await page.getByLabel("E-mail").fill(`${label}-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca ${label} ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();
  return id;
}

test("3.0-F3: timbrado com logo, novas variáveis e prévia em PDF antes de gerar", async ({ page }) => {
  const id = await register(page, "l3f3");

  // processo com partes
  await page.goto("/processos/novo");
  await page.getByLabel("Título do processo").fill(`Caso ${id}`);
  await page.getByRole("button", { name: "Cadastrar processo" }).click();
  await expect(page.getByRole("heading", { name: `Caso ${id}` })).toBeVisible();

  // timbrado
  await page.goto("/documentos/timbrados");
  await page.getByRole("button", { name: "Novo timbrado" }).click();
  await page.getByLabel("Nome do timbrado").fill(`Oficial ${id}`);
  await page.getByLabel(/Cabeçalho/).fill("TSB Advocacia\nOAB/BA 12345");
  await page.getByLabel(/Rodapé/).fill("(71) 0000-0000");
  await page.getByLabel(/Logo/).setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await page.getByLabel("Usar como padrão").check();
  await page.getByRole("button", { name: "Criar timbrado" }).click();
  await expect(page.getByTestId("letterhead-row")).toContainText(`Oficial ${id}`);
  await expect(page.getByTestId("letterhead-row")).toContainText("Padrão");
  await expect(page.getByTestId("letterhead-row")).toContainText("Com logo");

  // modelo com variável nova
  await page.goto("/documentos/modelos/novo");
  await page.getByLabel("Nome do modelo").fill(`Modelo ${id}`);
  await page.getByLabel("Texto do modelo").fill("# PETIÇÃO\n\nResponsável: {{processo.responsavel}}. Polo passivo: {{processo.polo_passivo}}.");
  await page.getByRole("button", { name: "Criar modelo" }).click();
  await expect(page.getByRole("link", { name: `Modelo ${id}` })).toBeVisible();

  // gerar: seletor de timbrado mostra o padrão; prévia abre PDF
  await page.goto("/documentos/gerar");
  await page.getByLabel("Modelo", { exact: true }).selectOption({ label: `Modelo ${id}` });
  await page.getByLabel("Processo", { exact: true }).selectOption({ label: `Caso ${id}` });
  await expect(page.getByLabel("Timbrado")).toContainText(`Padrão (Oficial ${id})`);
  const previewReq = page.context().waitForEvent("request", { predicate: (r) => r.url().includes("/api/templates/preview"), timeout: 15000 });
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Pré-visualizar em PDF" }).click();
  await popupPromise;
  expect((await previewReq).url()).toContain("/api/templates/preview");

  const tplId = await page.getByLabel("Modelo", { exact: true }).inputValue();
  const caseId = await page.getByLabel("Processo", { exact: true }).inputValue();
  const res = await page.request.get(`/api/templates/preview?modelo=${tplId}&processo=${caseId}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
  expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
  expect((await page.request.get(`/api/templates/preview?modelo=nao-e-uuid`)).status()).toBe(400);

  // gerar o .docx com o timbrado padrão
  await page.getByRole("button", { name: "Gerar documento (.docx)" }).click();
  await expect(page.getByRole("heading", { name: `Modelo ${id}.docx` })).toBeVisible();
});

test("3.0-F3: prévia exige login", async ({ request }) => {
  const res = await request.get("/api/templates/preview?modelo=00000000-0000-4000-8000-000000000000");
  expect(res.headers()["content-type"] ?? "").not.toContain("application/pdf");
  expect([200, 401]).toContain(res.status());
});
