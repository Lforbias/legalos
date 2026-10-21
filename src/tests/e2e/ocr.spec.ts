import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);

test("OCR: envia imagem, extrai o texto, busca pelo conteúdo e isola entre escritórios", async ({ page, browser }) => {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona ocr${id}`);
  await page.getByLabel("E-mail").fill(`dona-ocr-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca ocr ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();

  await page.goto("/processos/novo");
  await page.getByLabel("Título do processo").fill(`Caso OCR ${id}`);
  await page.getByRole("button", { name: "Cadastrar processo" }).click();
  await expect(page.getByRole("heading", { name: `Caso OCR ${id}` })).toBeVisible();
  await page.goto(`${page.url()}?aba=documentos`);
  await page.locator("#document-file").setInputFiles({ name: "intimacao.png", mimeType: "image/png", buffer: fs.readFileSync(path.join(process.cwd(), "src/tests/fixtures/scan.png")) });
  await expect(page.getByText("intimacao.png")).toBeVisible();

  // antes de extrair: a busca por conteúdo não acha
  await page.goto("/documentos?conteudo=hearing");
  await expect(page.getByText(/Nada encontrado/)).toBeVisible();

  // extração em lote
  await page.getByRole("button", { name: /Extrair texto dos pendentes/ }).click();
  await expect(page.getByTestId("pending-result")).toContainText("1 com texto");
  await page.goto("/documentos?conteudo=HEARING");
  await expect(page.getByTestId("content-count")).toContainText("1 documento(s)");
  await expect(page.getByText(/Hearing scheduled for March/)).toBeVisible();

  // página do documento mostra status e prévia
  await page.getByRole("listitem").getByRole("link", { name: "intimacao.png" }).click();
  await expect(page.getByTestId("text-status")).toHaveText("Texto extraído");
  await page.getByText("Ver início do texto extraído").click();
  await expect(page.getByTestId("text-preview")).toContainText("Plaintiff requests injunction relief");

  // outro escritório não enxerga
  const other = await browser.newContext();
  const p2 = await other.newPage();
  const id2 = uid();
  await p2.goto("/register");
  await p2.getByLabel("Nome completo").fill(`Dona o2${id2}`);
  await p2.getByLabel("E-mail").fill(`dona-o2-${id2}@example.test`);
  await p2.getByLabel("Senha", { exact: true }).fill(password);
  await p2.getByRole("button", { name: "Criar conta" }).click();
  await p2.getByLabel("Nome do escritório").fill(`Banca o2 ${id2}`);
  await p2.getByRole("button", { name: "Criar escritório" }).click();
  await expect(p2.getByRole("heading", { name: /Olá/ })).toBeVisible();
  await p2.goto("/documentos?conteudo=hearing");
  await expect(p2.getByText(/Nada encontrado/)).toBeVisible();
  await other.close();
});
