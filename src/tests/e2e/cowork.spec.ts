import { expect, test, type Browser, type Page } from "@playwright/test";
import { Client } from "pg";
import { completeWelcomeOnboarding, testDatabaseUrl } from "./support/welcome";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

async function register(page: Page, name: string, email: string) {
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(name);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
}

async function sql<T>(query: string, params: unknown[] = []): Promise<T[]> {
  const db = new Client({ connectionString: testDatabaseUrl() });
  await db.connect();
  try {
    return (await db.query(query, params)).rows as T[];
  } finally {
    await db.end();
  }
}

async function newOffice(browser: Browser, baseURL: string, name: string, email: string, office: string) {
  const ctx = await browser.newContext({ baseURL });
  const page = await ctx.newPage();
  await register(page, name, email);
  await completeWelcomeOnboarding(page, office);
  return { ctx, page };
}

const composer = (page: Page) => page.getByTestId("cowork-composer").getByRole("textbox");
async function send(page: Page, text: string) {
  await composer(page).fill(text);
  await composer(page).press("Enter");
}

test("Cowork: conversa em tempo real, sigilo, tarefa, reunião, painel e isolamento entre escritórios", async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const id = uid();
  const ownerEmail = `cowork-dona-${id}@example.test`;
  const biaEmail = `cowork-bia-${id}@example.test`;

  // Escritório A: dona cria, convida a advogada Bia.
  const { ctx: ownerCtx, page: owner } = await newOffice(browser, baseURL!, "Talita Cowork", ownerEmail, `Escritório Cowork ${id}`);
  await owner.goto("/configuracoes/equipe");
  await owner.getByRole("button", { name: "Convidar usuário" }).click();
  await owner.getByLabel("E-mail", { exact: true }).fill(biaEmail);
  await owner.getByLabel("Perfil", { exact: true }).selectOption({ label: "Advogado" });
  await owner.getByRole("button", { name: "Gerar convite" }).click();
  const link = (await owner.locator("code").first().innerText()).trim();
  const biaCtx = await browser.newContext({ baseURL });
  const bia = await biaCtx.newPage();
  await bia.goto(link);
  await bia.getByRole("link", { name: "Criar conta para aceitar" }).click();
  await bia.getByLabel("Nome completo").fill("Bia Cowork");
  await bia.getByLabel("Senha", { exact: true }).fill(password);
  await bia.getByRole("button", { name: "Criar conta" }).click();
  await expect(bia).toHaveURL(/\/dashboard(?:\?|$)/);

  // Dados fictícios: processo sigiloso do escritório A (Bia não integra a equipe do processo).
  const [org] = await sql<{ id: string }>("SELECT o.id FROM organizations o JOIN memberships m ON m.organization_id = o.id JOIN users u ON u.id = m.user_id WHERE u.email = $1", [ownerEmail]);
  const caseTitle = `Sigiloso Ômega ${id}`;
  await sql("INSERT INTO cases (id, organization_id, title, confidential, updated_at) VALUES (gen_random_uuid(), $1, $2, true, now())", [org!.id, caseTitle]);

  // Cowork no menu principal; ambos abrem o espaço com o canal Geral.
  await owner.goto("/dashboard");
  await owner.getByTestId("nav-cowork").click();
  await expect(owner).toHaveURL(/\/cowork/);
  await expect(owner.getByTestId("cowork-channel-title")).toHaveText("Geral");
  await expect(owner.getByTestId("cowork-connection")).toHaveAttribute("data-state", "live");
  await bia.goto("/cowork");
  await expect(bia.getByTestId("cowork-channel-title")).toHaveText("Geral");
  await expect(bia.getByTestId("cowork-connection")).toHaveAttribute("data-state", "live");

  // 1. Conversa direta em tempo real (sem recarregar a página da Bia) e histórico persistente.
  await owner.getByTestId("cowork-new-conversation").click();
  await owner.getByTestId("cowork-person-option").filter({ hasText: "Bia Cowork" }).click();
  await owner.getByTestId("cowork-open-conversation").click();
  await expect(owner.getByTestId("cowork-channel-title")).toHaveText("Bia Cowork");
  await send(owner, "Bia, consegue revisar a réplica hoje? Reservado DM-7781");
  await expect(owner.getByTestId("cowork-message").filter({ hasText: "DM-7781" })).toBeVisible();
  const dmRow = bia.getByTestId("cowork-channel-row").filter({ hasText: "Talita Cowork" });
  await expect(dmRow).toBeVisible();
  await expect(dmRow.getByTestId("cowork-unread")).toHaveText("1");
  await dmRow.click();
  await expect(bia.getByTestId("cowork-message").filter({ hasText: "DM-7781" })).toBeVisible();
  await send(bia, "Consigo sim, envio até as 17h.");
  await expect(owner.getByTestId("cowork-message").filter({ hasText: "envio até as 17h" })).toBeVisible();
  await bia.reload();
  await expect(bia.getByTestId("cowork-message").filter({ hasText: "DM-7781" })).toBeVisible();
  await expect(bia.getByTestId("cowork-message").filter({ hasText: "envio até as 17h" })).toBeVisible();

  // 3. Cartão de processo sigiloso: a dona vê; Bia vê só "conteúdo restrito", sem título.
  await owner.getByTestId("cowork-channel-row").filter({ hasText: "Geral" }).click();
  await owner.getByTestId("cowork-share-button").click();
  await owner.getByRole("tab", { name: "Processo" }).click();
  await owner.getByLabel("Buscar item").fill("Ômega");
  await owner.getByTestId("cowork-share-result").filter({ hasText: caseTitle }).click();
  await send(owner, "Acompanhem este processo.");
  await expect(owner.getByTestId("cowork-card").filter({ hasText: caseTitle })).toBeVisible();
  await bia.getByTestId("cowork-channel-row").filter({ hasText: "Geral" }).click();
  const shared = bia.getByTestId("cowork-message").filter({ hasText: "Acompanhem este processo." });
  await expect(shared.getByTestId("cowork-card-restricted")).toBeVisible();
  await expect(bia.getByText(caseTitle)).toHaveCount(0);

  // Anexo: enviado e baixável por quem participa.
  await owner.getByTestId("cowork-file-input").setInputFiles({ name: "parecer.pdf", mimeType: "application/pdf", buffer: PDF });
  await send(owner, "Parecer em anexo");
  const attachment = bia.getByTestId("cowork-message").filter({ hasText: "Parecer em anexo" }).getByTestId("cowork-attachment");
  await expect(attachment).toBeVisible();
  const attachmentHref = (await attachment.getAttribute("href"))!;
  expect((await bia.request.get(attachmentHref)).status()).toBe(200);

  // 4. Mensagem → tarefa com responsável Bia, visível no módulo de Tarefas dela.
  const msg = owner.getByTestId("cowork-message").filter({ hasText: "Acompanhem este processo." });
  await msg.hover();
  await msg.getByTestId("cowork-message-menu").click();
  await owner.getByRole("menuitem", { name: "Transformar em trabalho" }).click();
  await owner.getByTestId("cowork-convert-title").fill(`Revisar réplica ${id}`);
  await owner.getByTestId("cowork-convert-assignee").selectOption({ label: "Bia Cowork" });
  await owner.getByTestId("cowork-convert-due").fill("2030-03-10");
  await owner.getByTestId("cowork-convert-submit").click();
  await expect(owner.getByTestId("cowork-toast")).toContainText("criada");
  await expect(msg.getByText(`Revisar réplica ${id}`)).toBeVisible();
  await bia.goto("/tarefas");
  await expect(bia.getByText(`Revisar réplica ${id}`).first()).toBeVisible();

  // 5. Reunião agendada com Bia, integrada à agenda e sem controles de vídeo simulados.
  await owner.goto("/cowork/reunioes/nova");
  await owner.getByTestId("meeting-title").fill(`Alinhamento ${id}`);
  await owner.getByTestId("meeting-date").fill("2030-03-11");
  await owner.getByTestId("cowork-person-option").filter({ hasText: "Bia Cowork" }).click();
  await owner.getByTestId("meeting-submit").click();
  await expect(owner).toHaveURL(/\/cowork\/reunioes\/[0-9a-f-]{36}$/);
  const meetingUrl = new URL(owner.url()).pathname;
  await expect(owner.getByTestId("meeting-video-disabled")).toBeVisible();
  await expect(owner.getByRole("button", { name: /câmera|microfone|entrar na chamada|compartilhar tela/i })).toHaveCount(0);
  await expect(owner.getByTestId("meeting-participant")).toHaveCount(2);
  await owner.getByRole("link", { name: "Na agenda do escritório" }).click();
  await expect(owner.getByLabel("Título", { exact: true })).toHaveValue(`Reunião: Alinhamento ${id}`);
  await expect(owner.getByRole("button", { name: "Remover Bia Cowork" })).toBeVisible(); // participante virou colaborador do compromisso
  await bia.goto(meetingUrl);
  await bia.getByTestId("meeting-accept").click();
  await expect(bia.getByTestId("meeting-accept")).toHaveAttribute("aria-pressed", "true");
  await owner.goto(meetingUrl);
  await expect(owner.getByTestId("meeting-participant").filter({ hasText: "Bia Cowork" })).toContainText("Confirmada");
  await owner.getByTestId("meeting-start").click();
  await expect(owner.getByTestId("meeting-status")).toHaveText("Em andamento");
  await owner.getByTestId("meeting-minutes").fill("Réplica revisada por Bia.");
  await owner.getByTestId("meeting-minutes-save").click();
  await owner.getByTestId("action-item-title").fill(`Protocolar réplica ${id}`);
  await owner.getByTestId("action-item-assignee").selectOption({ label: "Bia Cowork" });
  await owner.getByTestId("action-item-submit").click();
  await expect(owner.getByTestId("meeting-action-items")).toContainText(`Protocolar réplica ${id}`);

  // 6. Painel do gestor: tarefas da Bia aparecem; o conteúdo da conversa direta, não.
  await owner.goto("/cowork/painel");
  const row = owner.getByTestId("insights-row").filter({ hasText: "Bia Cowork" });
  await expect(row).toBeVisible();
  await expect(owner.getByTestId("insights-table")).not.toContainText("DM-7781");
  expect(await owner.content()).not.toContain("DM-7781");
  await bia.goto("/cowork/painel");
  await expect(bia.getByText("Acesso negado")).toBeVisible();

  // 8. Resiliência: reenvio com o mesmo identificador não duplica.
  const [general] = await sql<{ id: string }>("SELECT id FROM cowork_channels WHERE organization_id = $1 AND slug = 'geral'", [org!.id]);
  const body = { body: `Reenvio ${id}`, clientNonce: `retry${id}abcdef` };
  const r1 = await bia.request.post(`/api/cowork/channels/${general!.id}/messages`, { data: body });
  const r2 = await bia.request.post(`/api/cowork/channels/${general!.id}/messages`, { data: body });
  expect(r1.status()).toBe(201);
  expect((await r1.json()).message.id).toBe((await r2.json()).message.id);
  expect((await sql<{ n: number }>("SELECT count(*)::int AS n FROM cowork_messages WHERE body = $1", [body.body]))[0]!.n).toBe(1);

  // Queda de conexão: a mensagem fica pendente e é reenviada sem duplicar.
  await bia.goto(`/cowork?c=${general!.id}`);
  await expect(bia.getByTestId("cowork-channel-title")).toHaveText("Geral");
  // Mensagens digitadas em sequência rápida são gravadas na mesma ordem.
  for (const n of [1, 2, 3]) await send(bia, `Ordem ${n} ${id}`);
  await expect(bia.getByTestId("cowork-message").filter({ hasText: `Ordem 3 ${id}` })).toBeVisible();
  await expect(bia.getByTestId("cowork-pending")).toHaveCount(0);
  const ordered = await sql<{ body: string }>("SELECT body FROM cowork_messages WHERE body LIKE $1 ORDER BY seq", [`Ordem % ${id}`]);
  expect(ordered.map((r) => r.body)).toEqual([1, 2, 3].map((n) => `Ordem ${n} ${id}`));
  await biaCtx.setOffline(true);
  await send(bia, `Enviada sem rede ${id}`);
  await expect(bia.getByTestId("cowork-pending")).toHaveAttribute("data-status", "failed");
  await expect(bia.getByTestId("cowork-retry")).toBeVisible();
  // Ao voltar a rede, a pendência é reenviada sozinha com o mesmo identificador.
  await biaCtx.setOffline(false);
  await expect(bia.getByTestId("cowork-message").filter({ hasText: `Enviada sem rede ${id}` })).toBeVisible();
  await expect(bia.getByTestId("cowork-pending")).toHaveCount(0);
  expect((await sql<{ n: number }>("SELECT count(*)::int AS n FROM cowork_messages WHERE body = $1", [`Enviada sem rede ${id}`]))[0]!.n).toBe(1);

  // 2/7. Outro escritório: não lê canais, mensagens, anexos nem reuniões de A, mesmo com os ids.
  const { ctx: otherCtx, page: other } = await newOffice(browser, baseURL!, "Rafael Outro", `cowork-outro-${id}@example.test`, `Outro Escritório ${id}`);
  await other.goto("/cowork");
  await expect(other.getByTestId("cowork-channel-title")).toHaveText("Geral");
  await expect(other.getByText("DM-7781")).toHaveCount(0);
  expect((await other.request.get(`/api/cowork/channels/${general!.id}/messages`)).status()).toBe(404);
  expect((await other.request.post(`/api/cowork/channels/${general!.id}/messages`, { data: { body: "intruso", clientNonce: `intruso${id}abc` } })).status()).toBe(404);
  expect((await other.request.get(attachmentHref)).status()).toBe(404);
  await other.goto(meetingUrl);
  await expect(other.getByText(`Alinhamento ${id}`)).toHaveCount(0);
  const channels = await (await other.request.get("/api/cowork/channels")).json();
  expect(JSON.stringify(channels)).not.toContain(general!.id);

  await Promise.all([ownerCtx.close(), biaCtx.close(), otherCtx.close()]);
});
