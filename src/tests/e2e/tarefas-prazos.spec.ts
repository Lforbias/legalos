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

test("tarefas, prazos (validação humana), agenda e notificações", async ({ page }) => {
  const id = await signUpWithOffice(page, "t");

  // processo para vincular
  await page.goto("/processos/novo");
  await page.getByLabel("Título do caso ou processo").fill(`Caso ${id}`);
  await page.getByRole("button", { name: "Cadastrar caso ou processo" }).click();
  await expect(page.getByRole("heading", { name: `Caso ${id}` })).toBeVisible();
  const caseUrl = page.url();

  // ---- tarefa: validação, criação, quadro e mudança de situação ----
  const nav = page.getByRole("navigation", { name: "Navegação Evolution" });
  await nav.getByRole("button", { name: "Minha Mesa", exact: true }).click();
  await nav.getByRole("link", { name: "Tarefas", exact: true }).click();
  await expect(page.getByText("Nenhuma tarefa cadastrada ainda.")).toBeVisible();
  await page.getByRole("link", { name: "Nova tarefa" }).first().click();
  await page.getByLabel("Título").fill("ab");
  await page.getByRole("button", { name: "Criar tarefa" }).click();
  await expect(page.getByText(/Informe um título/)).toBeVisible();
  await page.getByLabel("Título").fill(`Revisar contrato ${id}`);
  await page.getByLabel("Prioridade").selectOption("HIGH");
  await page.getByRole("button", { name: "Criar tarefa" }).click();
  await expect(page.getByRole("heading", { name: `Revisar contrato ${id}` })).toBeVisible();

  await page.getByLabel("Comentário", { exact: true }).fill("Falta a cláusula de rescisão.");
  await page.getByRole("button", { name: "Comentar" }).click();
  await expect(page.getByText("Falta a cláusula de rescisão.")).toBeVisible();

  await page.goto("/tarefas?visao=quadro");
  await expect(page.getByRole("region", { name: "A fazer" }).getByText(`Revisar contrato ${id}`)).toBeVisible();
  await page.getByRole("region", { name: "A fazer" }).getByLabel("Situação da tarefa").selectOption("DONE");
  await expect(page.getByRole("region", { name: "Concluída" }).getByText(`Revisar contrato ${id}`)).toBeVisible();

  // ---- prazo: cálculo auxiliar, rascunho e validação humana ----
  await page.goto(`${caseUrl}`);
  await page.getByRole("navigation", { name: "Seções" }).getByRole("link", { name: "Prazos" }).click();
  await page.getByRole("link", { name: "Novo prazo" }).click();
  await page.getByLabel("Título").fill(`Contestação ${id}`);
  await page.getByLabel("Ciência / publicação").fill("2030-05-06");
  await page.getByLabel("Dias", { exact: true }).fill("5");
  await page.getByLabel("Contagem", { exact: true }).selectOption("BUSINESS");
  await page.getByRole("button", { name: "Calcular sugestão" }).click();
  await expect(page.getByText(/Sugestão: 13\/05\/2030/)).toBeVisible();
  await expect(page.getByLabel("Data fatal")).toHaveValue("2030-05-13");
  await page.getByRole("button", { name: "Cadastrar prazo" }).click();
  await expect(page.getByRole("heading", { name: `Contestação ${id}` })).toBeVisible();
  await expect(page.getByText("Aguardando validação").first()).toBeVisible();
  await expect(page.getByText(/não foi validado/)).toBeVisible();
  await page.getByRole("button", { name: "Validar prazo" }).click();
  await expect(page.getByText("Validado", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Validado por/)).toBeVisible();
  await page.getByRole("button", { name: "Marcar como cumprido" }).click();
  await expect(page.getByText("Cumprido", { exact: true }).first()).toBeVisible();

  // linha do tempo do processo registrou o ciclo do prazo
  await page.goto(`${caseUrl}?aba=andamentos`);
  await expect(page.getByText(/Prazo validado: Contestação/)).toBeVisible();

  // ---- agenda: compromisso aparece no mês ----
  await page.goto("/agenda/novo?data=2030-05-10");
  await page.getByLabel("Título").fill(`Audiência ${id}`);
  await page.getByLabel("Tipo").selectOption("HEARING");
  await page.getByRole("button", { name: "Agendar" }).click();
  await expect(page).toHaveURL(/\/agenda\?mes=2030-05/);
  await expect(page.getByRole("link", { name: new RegExp(`Audiência ${id}`) }).first()).toBeVisible();

  // ---- notificações: tarefa atrasada atribuída gera aviso no sino ----
  await page.goto("/tarefas/nova");
  await page.getByLabel("Título").fill(`Atrasada ${id}`);
  await page.getByLabel("Vencimento").fill("2020-01-02");
  await page.getByRole("button", { name: "Criar tarefa" }).click();
  await expect(page.getByRole("heading", { name: `Atrasada ${id}` })).toBeVisible();
  await page.goto("/notificacoes");
  await expect(page.getByText(new RegExp(`Tarefa atrasada .*Atrasada ${id}`))).toBeVisible();
  await page.getByRole("button", { name: "Marcar todas como lidas" }).first().click();
  await expect(page.getByText("Nova", { exact: true })).toHaveCount(0);
});

test("tarefas e prazos de um escritório não aparecem em outro", async ({ page, browser }) => {
  const idA = await signUpWithOffice(page, "iso-a");
  await page.goto("/tarefas/nova");
  await page.getByLabel("Título").fill(`Segredo ${idA}`);
  await page.getByRole("button", { name: "Criar tarefa" }).click();
  await expect(page.getByRole("heading", { name: `Segredo ${idA}` })).toBeVisible();
  const taskUrl = page.url();

  const ctxB = await browser.newContext({ baseURL: taskUrl.split("/tarefas")[0] });
  const b = await ctxB.newPage();
  await signUpWithOffice(b, "iso-b");
  await b.goto(taskUrl);
  await expect(b.getByRole("heading", { name: `Segredo ${idA}` })).toHaveCount(0);
  await b.goto("/tarefas");
  await expect(b.getByText(`Segredo ${idA}`)).toHaveCount(0);
  await ctxB.close();
});

test("equipe e produtividade: carga por responsável e registro de horas", async ({ page }) => {
  const id = await signUpWithOffice(page, "eq");
  await page.goto("/tarefas/nova");
  await page.getByLabel("Título").fill(`Tarefa de carga ${id}`);
  await page.getByLabel("Vencimento").fill("2020-01-02");
  await page.getByRole("button", { name: "Criar tarefa" }).click();
  await expect(page.getByRole("heading", { name: `Tarefa de carga ${id}` })).toBeVisible();

  await page.getByRole("button", { name: "Administração & Gestão", exact:true }).click();
  await page.getByRole("link", { name: "Equipe", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Equipe e produtividade" })).toBeVisible();
  const row = page.getByRole("row", { name: new RegExp(`Dona eq${id}`) });
  await expect(row).toBeVisible();

  await page.getByLabel("Duração").fill("abc");
  await page.getByLabel("Atividade").fill("Revisão de minuta");
  await page.getByRole("button", { name: "Registrar horas" }).click();
  await expect(page.getByText(/Duração inválida/)).toBeVisible();
  await page.getByLabel("Duração").fill("1:30");
  await page.getByRole("button", { name: "Registrar horas" }).click();
  await expect(page.getByText("Revisão de minuta")).toBeVisible();
  await expect(page.getByText("Total: 1h30")).toBeVisible();
  await page.getByRole("button", { name: "Excluir lançamento" }).click();
  await expect(page.getByText("Revisão de minuta")).toHaveCount(0);
});

test("caixa de entrada retirada bloqueia leitura e cadastro", async ({ request }) => {
  await expectRetired(request, ["/caixa-de-entrada", "/caixa-de-entrada/nova"]);
});
