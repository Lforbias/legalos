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

test("tarefas, prazos (validação humana), agenda e notificações", async ({ page }) => {
  const id = await signUpWithOffice(page, "t");

  // processo para vincular
  await page.goto("/processos/novo");
  await page.getByLabel("Título do processo").fill(`Caso ${id}`);
  await page.getByRole("button", { name: "Cadastrar processo" }).click();
  await expect(page.getByRole("heading", { name: `Caso ${id}` })).toBeVisible();
  const caseUrl = page.url();

  // ---- tarefa: validação, criação, quadro e mudança de situação ----
  await page.getByRole("link", { name: /^Tarefas/ }).first().click();
  await expect(page.getByText("Nenhuma tarefa cadastrada ainda.")).toBeVisible();
  await page.getByRole("link", { name: "Nova tarefa" }).first().click();
  await page.getByLabel("Título").fill("ab");
  await page.getByRole("button", { name: "Criar tarefa" }).click();
  await expect(page.getByText(/Informe um título/)).toBeVisible();
  await page.getByLabel("Título").fill(`Revisar contrato ${id}`);
  await page.getByLabel("Prioridade").selectOption("HIGH");
  await page.getByRole("button", { name: "Criar tarefa" }).click();
  await expect(page.getByRole("heading", { name: `Revisar contrato ${id}` })).toBeVisible();

  await page.getByLabel("Comentário").fill("Falta a cláusula de rescisão.");
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

  await page.getByRole("button", { name: "Gestão do escritório", exact:true }).click();
  await page.getByRole("link", { name: /^Equipe e produtividade/ }).first().click();
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

function cnj(seq: string) {
  const base = `${seq}2024826` + "0100";
  const dd = String(98n - (BigInt(`${base}00`) % 97n)).padStart(2, "0");
  return `${seq}-${dd}.2024.8.26.0100`;
}

test("caixa de entrada: texto colado, vínculo automático, duplicidade, providências e isolamento", async ({ page, browser }) => {
  const id = await signUpWithOffice(page, "cx");
  const number = cnj("0007777");

  await page.goto("/processos/novo");
  await page.getByLabel("Título do processo").fill(`Caso ${id}`);
  await page.getByLabel("Número CNJ").fill(number);
  await page.getByRole("button", { name: "Cadastrar processo" }).click();
  await expect(page.getByRole("heading", { name: `Caso ${id}` })).toBeVisible();

  await page.getByTestId("space-box").first().click();
  await expect(page.getByTestId("box-dashboard")).toBeVisible();
  await page.getByRole("link", { name: /^Caixa de entrada/ }).first().click();
  await expect(page.getByText("Nenhuma intimação encontrada.")).toBeVisible();
  await page.getByRole("link", { name: "Nova intimação" }).first().click();

  const texto = `TRIBUNAL DE JUSTIÇA DO ESTADO DE SÃO PAULO\nProcesso ${number}\nData da publicação: 12/03/2030\nIntimação para manifestação no prazo de 5 dias úteis. Ref ${id}`;
  await page.getByLabel("Texto", { exact: true }).fill(texto);
  await page.getByRole("button", { name: "Analisar texto" }).click();
  await expect(page.getByText(/Campos sugeridos a partir do texto/)).toBeVisible();
  await expect(page.getByLabel("Número do processo (CNJ)")).toHaveValue(number);
  await expect(page.getByLabel("Data de publicação")).toHaveValue("2030-03-12");
  await page.getByLabel("Título", { exact: true }).fill(`Intimação ${id}`);
  await page.getByRole("button", { name: "Registrar intimação" }).click();

  await expect(page.getByRole("heading", { name: `Intimação ${id}` })).toBeVisible();
  await expect(page.getByRole("link", { name: `Caso ${id}` }).first()).toBeVisible(); // vinculada automaticamente
  await expect(page.getByText(/O texto menciona prazo de/)).toBeVisible();
  const noticeUrl = page.url();

  // duplicata do mesmo texto
  await page.goto("/caixa-de-entrada/nova");
  await page.getByLabel("Texto", { exact: true }).fill(texto);
  await page.getByLabel("Título", { exact: true }).fill(`Repetida ${id}`);
  await page.getByLabel("Data de recebimento").fill("2030-03-13");
  await page.getByRole("button", { name: "Registrar intimação" }).click();
  await expect(page.getByText(/Teor idêntico/)).toBeVisible();

  // providência: prazo pré-preenchido a partir da intimação
  await page.goto(noticeUrl);
  await page.getByRole("link", { name: "Cadastrar prazo" }).click();
  await expect(page.getByLabel("Dias", { exact: true })).toHaveValue("5");
  await page.getByRole("button", { name: "Calcular sugestão" }).click();
  await expect(page.getByLabel("Data fatal")).toHaveValue("2030-03-19");
  await page.getByRole("button", { name: "Cadastrar prazo" }).click();
  await page.waitForURL(/\/prazos\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Aguardando validação").first()).toBeVisible();

  await page.goto(noticeUrl);
  await expect(page.getByRole("link", { name: /Prazo — Intimação/ })).toBeVisible();
  await page.getByRole("button", { name: "Marcar como tratada" }).click();
  await expect(page.getByText("Tratada", { exact: true }).first()).toBeVisible();

  // outro escritório não enxerga
  const ctxB = await browser.newContext({ baseURL: noticeUrl.split("/caixa-de-entrada")[0] });
  const b = await ctxB.newPage();
  await signUpWithOffice(b, "cx-b");
  await b.goto(noticeUrl);
  await expect(b.getByRole("heading", { name: `Intimação ${id}` })).toHaveCount(0);
  await ctxB.close();
});
