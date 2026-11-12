import { expectRetired } from "./box-retired-checks";
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
  await expect(page.getByRole("heading", { name: /Bom dia/ })).toBeVisible();
  return id;
}

test("modelos, geração de .docx e versões com peticionamento retirado", async ({ page }) => {
  const id = await signUpWithOffice(page, "d");

  await page.goto("/processos/novo");
  await page.getByLabel("Título do caso ou processo").fill(`Caso ${id}`);
  await page.getByRole("button", { name: "Cadastrar caso ou processo" }).click();
  await expect(page.getByRole("heading", { name: `Caso ${id}` })).toBeVisible();

  // ---- modelo ----
  await page.goto("/documentos/modelos");
  await expect(page.getByText(/Nenhum modelo cadastrado/)).toBeVisible();
  await page.getByRole("link", { name: "Novo modelo" }).click();
  await page.getByLabel("Nome do modelo").fill(`Procuração ${id}`);
  await page.getByRole("button", { name: /Começar a partir de um exemplo/ }).click();
  await expect(page.getByLabel("Texto do modelo")).toHaveValue(/PROCURAÇÃO AD JUDICIA/);
  await page.getByLabel("Texto do modelo").fill("# TESTE\n\n{{cliente.nome}} e {{campo.inexistente}}");
  await page.getByRole("button", { name: "Criar modelo" }).click();
  await expect(page.getByText(/Campos desconhecidos: \{\{campo\.inexistente\}\}/)).toBeVisible();
  await page.getByLabel("Texto do modelo").fill("# PROCURAÇÃO\n\nOutorgante: {{cliente.nome}}. Processo: {{processo.titulo}}. {{data.hoje_extenso}}.");
  await page.getByRole("button", { name: "Criar modelo" }).click();
  await expect(page.getByRole("link", { name: `Procuração ${id}` })).toBeVisible();

  // ---- gerar documento ----
  await page.goto("/documentos/gerar");
  await page.getByLabel("Modelo").selectOption({ label: `Procuração ${id}` });
  await page.getByLabel("Processo").selectOption({ label: `Caso ${id}` });
  await page.getByRole("button", { name: "Gerar documento (.docx)" }).click();
  await expect(page.getByRole("heading", { name: `Procuração ${id}.docx` })).toBeVisible();
  await expect(page.getByText(/ficaram marcados como/)).toBeVisible();
  await expect(page.getByText("gerado de modelo")).toBeVisible();

  const documentUrl = page.url();
  await page.getByRole("button", { name: "Solicitar revisão da versão 1", exact: true }).click();
  await expect(page.getByText("Aguardando conferência por outra pessoa com acesso ao documento.")).toBeVisible();
  await page.goto("/evolution/juridico");
  await expect(page.getByRole("region", { name: "Fila de revisão jurídica" }).getByRole("link", { name: new RegExp(`Procuração ${id}`) })).toBeVisible();
  await page.goto(documentUrl);

  // ---- nova versão ----
  await page.getByLabel("Arquivo da nova versão").setInputFiles({ name: "assinada.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% assinada\n%%EOF") });
  await page.getByLabel("O que mudou (opcional)").fill("Versão assinada");
  await page.getByRole("button", { name: "Enviar nova versão" }).click();
  await expect(page.getByText("Versão assinada")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Histórico de versões" })).toBeVisible();
  await expect(page.getByText("atual", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Baixar versão 1" })).toBeVisible();

  await expect(page.getByText(/Substituída por nova versão/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Solicitar revisão da versão 2", exact: true })).toBeVisible();

  // arquivo inválido é recusado
  await page.getByLabel("Arquivo da nova versão").setInputFiles({ name: "falso.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ não é pdf") });
  await page.getByRole("button", { name: "Enviar nova versão" }).click();
  await expect(page.getByText(/não corresponde/)).toBeVisible();

  // repositório
  await page.goto("/documentos?q=procura");
  await expect(page.getByRole("link", { name: `Procuração ${id}.docx` })).toBeVisible();

  await expectRetired(page.request, ["/peticoes", "/peticoes/nova"]);
});

test("isolamento: outro escritório não vê documentos nem modelos", async ({ browser }) => {
  const a = await browser.newPage();
  const idA = await signUpWithOffice(a, "iso1");
  await a.goto("/documentos/modelos/novo");
  await a.getByLabel("Nome do modelo").fill(`Modelo secreto ${idA}`);
  await a.getByLabel("Texto do modelo").fill("Conteúdo {{cliente.nome}}");
  await a.getByRole("button", { name: "Criar modelo" }).click();
  await expect(a.getByRole("link", { name: `Modelo secreto ${idA}` })).toBeVisible();
  await a.getByRole("link", { name: `Modelo secreto ${idA}` }).click();
  await a.waitForURL(/\/documentos\/modelos\/[0-9a-f-]{36}$/);
  const tplUrl = a.url();

  const b = await browser.newPage();
  await signUpWithOffice(b, "iso2");
  await b.goto("/documentos/modelos");
  await expect(b.getByText(`Modelo secreto ${idA}`)).toHaveCount(0);
  const res = await b.goto(tplUrl);
  expect(res?.status()).toBe(404);
  await a.close();
  await b.close();
});

test("autotextos no modelo e documentos do processo", async ({ page }) => {
  const id = await signUpWithOffice(page, "at");
  await page.goto("/processos/novo");
  await page.getByLabel("Título do caso ou processo").fill(`Caso ${id}`);
  await page.getByRole("button", { name: "Cadastrar caso ou processo" }).click();
  await expect(page.getByRole("heading", { name: `Caso ${id}` })).toBeVisible();

  // ---- autotexto ----
  await page.goto("/documentos/autotextos");
  await expect(page.getByText(/Nenhum autotexto cadastrado/)).toBeVisible();
  await page.getByRole("link", { name: "Novo autotexto" }).click();
  await page.getByLabel("Nome", { exact: true }).fill(`Fecho ${id}`);
  await page.getByLabel("Código (usado nos modelos)").fill("fecho-e2e");
  await page.getByLabel("Texto", { exact: true }).fill("Termos em que pede deferimento. {{advogado.nome}}");
  await page.getByRole("button", { name: "Criar autotexto" }).click();
  await expect(page.getByRole("link", { name: `Fecho ${id}` })).toBeVisible();
  await expect(page.getByText("{{autotexto.fecho-e2e}}")).toBeVisible();

  // ---- modelo que usa o autotexto (e recusa um inexistente) ----
  await page.goto("/documentos/modelos/novo");
  await page.getByLabel("Nome do modelo").fill(`Peça ${id}`);
  await page.getByLabel("Texto do modelo").fill("# PEÇA\n\n{{autotexto.nao-existe}}");
  await page.getByRole("button", { name: "Criar modelo" }).click();
  await expect(page.getByText(/Campos desconhecidos: \{\{autotexto\.nao-existe\}\}/)).toBeVisible();
  await page.getByRole("button", { name: "autotexto.fecho-e2e" }).click();
  await expect(page.getByLabel("Texto do modelo")).toHaveValue(/\{\{autotexto\.fecho-e2e\}\}/);
  await page.getByLabel("Texto do modelo").fill("# PEÇA\n\nProcesso {{processo.titulo}}.\n\n{{autotexto.fecho-e2e}}");
  await page.getByRole("button", { name: "Criar modelo" }).click();
  await expect(page.getByRole("link", { name: `Peça ${id}` })).toBeVisible();

  // ---- dois documentos no processo ----
  for (const title of [`Principal ${id}`, `Procuração ${id}`]) {
    await page.goto("/documentos/gerar");
    await page.getByLabel("Modelo").selectOption({ label: `Peça ${id}` });
    await page.getByLabel("Título do documento").fill(title);
    await page.getByLabel("Processo").selectOption({ label: `Caso ${id}` });
    await page.getByRole("button", { name: "Gerar documento (.docx)" }).click();
    await expect(page.getByRole("heading", { name: `${title}.docx` })).toBeVisible();
  }

  await expectRetired(page.request, ["/peticoes/nova"]);
});
