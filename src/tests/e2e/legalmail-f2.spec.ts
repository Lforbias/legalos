import { expect, test, type Page } from "@playwright/test";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

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

test("3.0-F2: tipo com pontuação, etiqueta, anexo, menção e histórico numa tarefa", async ({ page }) => {
  const id = await register(page, "l3f2");

  // configurações: tipo e etiqueta
  await page.goto("/configuracoes/tarefas");
  await page.getByRole("button", { name: "Novo tipo" }).click();
  await page.getByLabel("Nome do tipo").fill(`Audiência ${id}`);
  await page.getByLabel("Pontos").fill("5");
  await page.getByRole("button", { name: "Cadastrar tipo" }).click();
  await expect(page.getByTestId("task-type-row")).toContainText(`Audiência ${id}`);
  await expect(page.getByTestId("task-type-row")).toContainText("5 pt");
  await page.getByRole("button", { name: "Nova etiqueta" }).click();
  await page.getByLabel("Nome da etiqueta").fill(`Prioridade ${id}`);
  await page.getByRole("button", { name: "Cadastrar etiqueta" }).click();
  await expect(page.getByTestId("task-label-row")).toContainText(`Prioridade ${id}`);

  // tarefa
  await page.goto("/tarefas/nova");
  await page.getByLabel("Título").fill(`Preparar audiência ${id}`);
  await page.getByRole("button", { name: /Criar tarefa|Salvar/ }).first().click();
  await expect(page.getByRole("heading", { name: `Preparar audiência ${id}` })).toBeVisible();

  // classificar
  await page.getByLabel("Tipo (pontuação)").selectOption({ label: `Audiência ${id} (5 pt)` });
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Salvar classificação" }).click();
  await expect(page.getByText("Salvo.")).toBeVisible();

  // anexo
  await page.getByLabel("Arquivo").setInputFiles({ name: "pauta.pdf", mimeType: "application/pdf", buffer: PDF });
  await page.getByRole("button", { name: "Anexar" }).click();
  await expect(page.getByTestId("task-attachment")).toContainText("pauta.pdf");

  // menção (inserida pelo seletor) e comentário
  await page.getByLabel("Comentário").fill("Atenção ao prazo.");
  await page.getByLabel("Mencionar alguém").selectOption({ index: 1 });
  await expect(page.getByLabel("Comentário")).toHaveValue(/@Pessoa l3f2/);
  await page.getByRole("button", { name: "Comentar" }).click();
  await expect(page.getByText("Atenção ao prazo.")).toBeVisible();

  // histórico
  const h = page.getByTestId("task-history");
  await expect(h).toContainText("Tarefa criada");
  await expect(h).toContainText(`Tipo: sem tipo → Audiência ${id}`);
  await expect(h).toContainText("Anexo adicionado: pauta.pdf");

  // lista: etiqueta, tipo e pontos
  await page.goto("/tarefas");
  await expect(page.getByText(`Audiência ${id} · 5 pt`)).toBeVisible();
  await expect(page.getByRole("link", { name: `Preparar audiência ${id}` })).toBeVisible();
});
