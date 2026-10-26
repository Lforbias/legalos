import {Client} from "pg";
import { expect, test } from "@playwright/test";
import { totpCode, totpStep } from "../../lib/security/totp";
import { APP_SECRET, inbound, startFakeWhatsapp, WA_TOKEN } from "../integration/fake-whatsapp";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);
const fake = startFakeWhatsapp();

test.beforeAll(async () => {
  await fake.start(3199);
});
test.afterAll(async () => {
  await fake.stop();
});

test("WhatsApp: conectar o número, receber pelo webhook assinado, responder, anotar e atribuir", async ({ page, request }) => {
  const id = uid();
  const pnid = `7${Date.now().toString().slice(-9)}`;
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona zap${id}`);
  await page.getByLabel("E-mail").fill(`dona-zap-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca zap ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();

  // Sem conexão: aviso honesto.
  await page.goto("/atendimento");
  await expect(page.getByText(/ainda não foi conectado/)).toBeVisible();

  // Conectar exige 2FA.
  await page.goto("/atendimento/configuracoes");
  await page.getByLabel("ID do número de telefone (Meta)").fill(pnid);
  await page.getByLabel("Token de acesso permanente").fill(WA_TOKEN);
  await page.getByRole("button", { name: "Conectar número" }).click();
  await expect(page.getByText(/verificação em duas etapas/i).first()).toBeVisible();

  await page.goto("/conta");
  await page.getByRole("button", { name: "Ativar verificação em duas etapas" }).click();
  const secret = (await page.getByTestId("mfa-secret").textContent())!.trim();
  await page.getByLabel("Código de 6 dígitos").fill(totpCode(secret, totpStep()));
  await page.getByRole("button", { name: "Ativar", exact: true }).click();
  await page.getByRole("button", { name: "Já guardei os códigos" }).click();

  await page.goto("/atendimento/configuracoes");
  await page.getByLabel("ID do número de telefone (Meta)").fill(pnid);
  await page.getByLabel("Token de acesso permanente").fill("token-que-a-meta-recusa-0123456789");
  await page.getByRole("button", { name: "Conectar número" }).click();
  await expect(page.getByText(/Não foi possível validar na Meta/)).toBeVisible();
  await page.getByLabel("Token de acesso permanente").fill(WA_TOKEN);
  await page.getByRole("button", { name: "Conectar número" }).click();
  await expect(page.getByText(/Conectado: \+55 71 99999-0000/)).toBeVisible();

  // Resposta rápida.
  await page.getByLabel("Atalho").fill("boas-vindas");
  await page.locator("#qr-ti").fill("Boas-vindas");
  await page.getByLabel("Texto", { exact: true }).fill("Olá! Como podemos ajudar?");
  await page.getByRole("button", { name: "Adicionar resposta rápida" }).click();
  await expect(page.getByText("/boas-vindas — Boas-vindas")).toBeVisible();

  // Webhook: verificação e assinatura.
  const ok = await request.get("/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verifica-e2e-0123456789&hub.challenge=desafio42");
  expect(await ok.text()).toBe("desafio42");
  const bad = await request.get("/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=errado-errado-errado&hub.challenge=x");
  expect(bad.status()).toBe(403);
  const ev = inbound(pnid, { id: `wamid.E2E${id}`, from: "5571988880000", name: "Maria Teste", text: "Bom dia, preciso de ajuda com meu processo" });
  const forged = await request.post("/api/whatsapp/webhook", { data: ev.body, headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=" + "0".repeat(64) } });
  expect(forged.status()).toBe(401);
  const sent = await request.post("/api/whatsapp/webhook", { data: ev.body, headers: { "content-type": "application/json", "x-hub-signature-256": ev.signature } });
  expect(sent.status()).toBe(200);
  expect(APP_SECRET).toBeTruthy();

  await page.goto("/atendimento");
  await expect(page.getByTestId("wa-list").getByText("Maria Teste")).toBeVisible();
  await expect(page.getByTestId("wa-list").getByText("Bom dia, preciso de ajuda com meu processo")).toBeVisible();
  await page.getByTestId("wa-list").getByText("Maria Teste").click();
  await expect(page.getByTestId("wa-msg-in").getByText("Bom dia, preciso de ajuda com meu processo")).toBeVisible();

  // Resposta rápida pela barra "/" e envio.
  await page.getByLabel("Mensagem", { exact: true }).fill("/boas");
  await page.getByRole("button", { name: "/boas-vindas — Boas-vindas" }).click();
  await expect(page.getByLabel("Mensagem", { exact: true })).toHaveValue("Olá! Como podemos ajudar?");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByTestId("wa-msg-out").getByText("Olá! Como podemos ajudar?")).toBeVisible();
  await expect(page.getByTestId("wa-msg-out").getByText("Enviada")).toBeVisible();
  const outReq = fake.requests.filter((r) => /\/messages$/.test(r.path) && r.body?.type === "text").at(-1)!;
  expect(outReq.body).toMatchObject({ to: "5571988880000", type: "text" });

  // Mensagem nova aparece sozinha, sem recarregar a página.
  const ev2 = inbound(pnid, { id: `wamid.E2EB${id}`, from: "5571988880000", name: "Maria Teste", text: "Chegou sozinha na tela" });
  const r2 = await request.post("/api/whatsapp/webhook", { data: ev2.body, headers: { "content-type": "application/json", "x-hub-signature-256": ev2.signature } });
  expect(r2.status()).toBe(200);
  await expect(page.getByTestId("wa-msg-in").getByText("Chegou sozinha na tela")).toBeVisible({ timeout: 10_000 });

  // Interligação: tarefa e lead nascem da conversa e aparecem nos outros módulos.
  await page.getByTestId("wa-links").getByRole("button", { name: "Criar tarefa", exact: true }).first().click();
  await page.getByLabel("Título da tarefa").fill("Ligar para a Maria sobre o processo");
  await page.getByTestId("wa-panel-task").getByRole("button", { name: "Criar tarefa", exact: true }).click();
  await expect(page.getByTestId("wa-msg-note").getByText(/Tarefa criada: “Ligar para a Maria sobre o processo”/)).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("wa-links").getByRole("button", { name: "Criar lead no CRM" }).click();
  await page.getByLabel("Interesse").fill("Revisão de benefício");
  await page.getByTestId("wa-panel-lead").getByRole("button", { name: "Criar lead", exact: true }).click();
  await expect(page.getByTestId("wa-msg-note").getByText(/Lead criado no CRM: Maria Teste/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("wa-links").getByText("Lead:")).toBeVisible();
  // Painel lateral: contato, lead criado, tarefa na agenda e histórico.
  const side = page.getByTestId("wa-side");
  await expect(side.getByTestId("side-name")).toHaveText("Maria Teste");
  await expect(side.getByTestId("side-lead")).toContainText("Maria Teste");
  await expect(side.getByTestId("side-stats")).toContainText("Mensagens recebidas / enviadas");
  await side.getByTestId("side-tab-agenda").click();
  await expect(side.getByText("Vincule a conversa a um cliente ou processo")).toBeVisible();
  await side.getByTestId("side-tab-historico").click();
  await expect(side.getByTestId("side-history")).toContainText("Lead criado no CRM");
  await side.getByTestId("side-tab-contato").click();
  await page.goto("/tarefas");
  await expect(page.getByText("Ligar para a Maria sobre o processo").first()).toBeVisible();
  await page.goto("/crm");
  await page.getByText("Maria Teste").first().click();
  await expect(page.getByTestId("chat-conversations")).toBeVisible(); // o caminho de volta: o lead mostra a conversa
  await page.goto("/atendimento");
  await page.getByTestId("wa-list").getByText("Maria Teste").click();

  // Nota interna.
  await page.getByLabel("Nota interna", { exact: true }).check();
  await page.getByRole("textbox", { name: "Nota interna" }).fill("Cliente já tem processo ativo.");
  await page.getByRole("button", { name: "Salvar nota" }).click();
  await expect(page.getByTestId("wa-msg-note").getByText("Cliente já tem processo ativo.")).toBeVisible();
  expect(fake.requests.filter((r) => /\/messages$/.test(r.path) && r.body?.type === "text").length).toBe(1); // a nota não foi para a Meta

  // Filas: criar a fila padrão, distribuir a conversa que esperava e conferir tela, filtro e pausa.
  await page.goto("/atendimento/configuracoes");
  const qp = page.getByTestId("queues-panel");
  await qp.getByLabel("Nome da fila").fill("Previdenciário");
  await qp.getByLabel("Fila padrão (recebe as conversas novas)").check();
  await qp.getByRole("button", { name: "Criar fila" }).click();
  await expect(qp.getByText("Previdenciário").first()).toBeVisible({ timeout: 10_000 });
  await qp.getByRole("button", { name: "Distribuir as que estão esperando" }).click();
  await expect(qp.getByText(/1 conversa\(s\) distribuída\(s\)/)).toBeVisible({ timeout: 10_000 });
  await page.goto("/atendimento");
  await page.locator("summary", { hasText: "Filtros" }).click();
  await expect(page.getByTestId("wa-queue-filter").getByRole("link", { name: /Previdenciário/ })).toBeVisible();
  await page.getByTestId("wa-queue-filter").getByRole("link", { name: /Previdenciário/ }).click();
  await expect(page.getByTestId("wa-list").getByText("Maria Teste")).toBeVisible();
  await expect(page.getByTestId("wa-list").getByText(/Previdenciário/)).toBeVisible();
  await page.getByTestId("wa-list").getByText("Maria Teste").click();
  await expect(page.getByTestId("wa-msg-note").getByText(/Distribuída automaticamente para/)).toBeVisible();
  await expect(page.getByTestId("wa-queue-select")).toHaveValue(/.+/);
  await page.getByTestId("wa-availability").click();
  await expect(page.getByTestId("wa-availability")).toHaveText("Em pausa", { timeout: 10_000 });
  await page.getByTestId("wa-availability").click();
  await expect(page.getByTestId("wa-availability")).toHaveText("Disponível", { timeout: 10_000 });
  await page.goto("/atendimento");
  await page.getByTestId("wa-list").getByText("Maria Teste").click();

  // Etiquetas e campos: definir nas configurações, usar na conversa, filtrar e buscar pelo valor.
  await page.goto("/atendimento/configuracoes");
  await page.getByTestId("labels-panel").getByLabel("Nome da etiqueta").fill("Urgente");
  await page.getByTestId("labels-panel").getByRole("button", { name: "Criar etiqueta" }).click();
  await expect(page.getByTestId("labels-panel").getByText(/Urgente · 0/)).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("fields-panel").getByLabel("Nome do campo").fill("Número do benefício");
  await page.getByTestId("fields-panel").getByRole("button", { name: "Criar campo" }).click();
  await expect(page.getByTestId("fields-panel").getByText(/Número do benefício/).first()).toBeVisible({ timeout: 10_000 });
  await page.goto("/atendimento");
  await page.getByTestId("wa-list").getByText("Maria Teste").click();
  await page.getByTestId("wa-labels").getByRole("button", { name: /Urgente/ }).click();
  await expect(page.getByTestId("wa-msg-note").getByText(/Etiquetas: adicionou “Urgente”/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /Campos \(0\/1 preenchidos\)/ }).click();
  await page.getByTestId("wa-fields").getByLabel("Número do benefício").fill("NB 123.456.789-0");
  await page.getByRole("button", { name: "Salvar campos" }).click();
  await expect(page.getByText("Campos salvos.")).toBeVisible({ timeout: 10_000 });
  await page.goto("/atendimento");
  await expect(page.getByTestId("wa-list").getByText("Urgente")).toBeVisible();
  if (!(await page.getByTestId("wa-label-filter").isVisible())) await page.locator("summary", { hasText: "Filtros" }).click();
  await page.getByTestId("wa-label-filter").getByRole("link", { name: "Urgente" }).click();
  await expect(page.getByTestId("wa-list").getByText("Maria Teste")).toBeVisible();
  await page.goto("/atendimento?q=123.456.789");
  await expect(page.getByTestId("wa-list").getByText("Maria Teste")).toBeVisible();
  await page.goto("/atendimento?q=999.999.999");
  await expect(page.getByText("Nenhuma conversa.")).toBeVisible();
  await page.goto("/atendimento");
  await page.getByTestId("wa-list").getByText("Maria Teste").click();

  // Automação: criar a regra, receber a mensagem pelo webhook e ver o efeito na conversa e no histórico.
  await page.goto("/atendimento/configuracoes");
  const ap = page.getByTestId("automations-panel");
  await ap.getByLabel("Nome da automação").fill("Audiência é urgente");
  await ap.getByLabel("Quando", { exact: true }).selectOption("KEYWORD");
  await ap.getByLabel(/Palavras/).fill("audiência, perícia");
  await ap.getByLabel("Ação 1").selectOption("ADD_LABEL");
  await ap.getByLabel("Etiqueta da ação").selectOption({ label: "Urgente" });
  await expect(ap.getByLabel("Ligada")).not.toBeChecked(); // nasce desligada: ligar é decisão explícita
  await ap.getByLabel("Ligada").check();
  await ap.getByRole("button", { name: "Criar automação" }).click();
  await expect(ap.getByText("Audiência é urgente").first()).toBeVisible({ timeout: 10_000 });
  const ev3 = inbound(pnid, { id: `wamid.E2EC${id}`, from: "5571988881111", name: "Pedro Auto", text: "Tenho AUDIENCIA na semana que vem" });
  const r3 = await request.post("/api/whatsapp/webhook", { data: ev3.body, headers: { "content-type": "application/json", "x-hub-signature-256": ev3.signature } });
  expect(r3.status()).toBe(200);
  await page.goto("/atendimento");
  const pedro = page.getByTestId("wa-list").locator("li", { hasText: "Pedro Auto" });
  await expect(pedro.getByText("Urgente")).toBeVisible({ timeout: 10_000 });
  await pedro.click();
  await expect(page.getByTestId("wa-msg-note").getByText(/Automação “Audiência é urgente”: etiqueta “Urgente”/)).toBeVisible();
  await page.goto("/atendimento/configuracoes");
  await expect(page.getByTestId("au-runs").getByText("Audiência é urgente")).toBeVisible();
  await page.goto("/atendimento");
  await page.getByTestId("wa-list").getByText("Maria Teste").click();

  // Cobrança de honorários: nasce DESLIGADA; salvar não liga; ligar exige confirmação; dá para desligar.
  await page.goto("/atendimento/configuracoes");
  const sw = page.getByTestId("switches-panel");
  await expect(sw.getByTestId("switch-status-billing")).toHaveText("Desligada");
  const bl = page.getByTestId("billing-panel");
  await bl.getByLabel("1 dia depois do vencimento (atraso)").check();
  await bl.getByLabel("Dados para pagamento (opcional, vai no final de toda mensagem)").fill("PIX 00.000.000/0001-00");
  await expect(bl.getByTestId("bl-preview")).toContainText("PIX 00.000.000/0001-00");
  await expect(bl.getByTestId("bl-preview")).toContainText("responda PARAR");
  await bl.getByRole("button", { name: "Salvar cobrança" }).click();
  await expect(bl.getByText("Cobrança automática salva.")).toBeVisible({ timeout: 10_000 });
  await expect(sw.getByTestId("switch-status-billing")).toHaveText("Desligada"); // salvar não liga
  await sw.getByTestId("switch-billing").getByRole("button", { name: "Ligar", exact: true }).click();
  await expect(sw.getByTestId("switch-confirm-billing")).toContainText("autorização da Dra. Talita");
  await expect(sw.getByTestId("switch-status-billing")).toHaveText("Desligada"); // ainda não: falta confirmar
  await sw.getByTestId("switch-billing").getByRole("button", { name: "Cancelar" }).click();
  await expect(sw.getByTestId("switch-status-billing")).toHaveText("Desligada");
  await sw.getByTestId("switch-billing").getByRole("button", { name: "Ligar", exact: true }).click();
  await sw.getByRole("button", { name: "Confirmo, ligar" }).click();
  await expect(sw.getByTestId("switch-status-billing")).toHaveText("Ligada", { timeout: 10_000 });
  await sw.getByTestId("switch-billing").getByRole("button", { name: "Desligar", exact: true }).click();
  await expect(sw.getByTestId("switch-status-billing")).toHaveText("Desligada", { timeout: 10_000 });
  await page.reload();
  await expect(page.getByTestId("billing-panel").getByLabel("1 dia depois do vencimento (atraso)")).toBeChecked();

  // SLA de resposta: nasce DESLIGADO; ligar e desligar; valida os minutos.
  await page.goto("/atendimento/configuracoes");
  const slaP = page.getByTestId("sla-panel");
  await expect(slaP.getByTestId("sla-status")).toHaveText("Desligado");
  await slaP.getByLabel("Avisar se ninguém responder em (minutos)").fill("0");
  await slaP.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(slaP.getByText(/Mínimo 1 minuto/)).toBeVisible({ timeout: 10_000 });
  await slaP.getByLabel("Avisar se ninguém responder em (minutos)").fill("15");
  await slaP.getByRole("button", { name: "Ligar", exact: true }).click();
  await expect(slaP.getByTestId("sla-status")).toHaveText("Ligado", { timeout: 10_000 });
  await slaP.getByRole("button", { name: "Desligar", exact: true }).click();
  await expect(slaP.getByTestId("sla-status")).toHaveText("Desligado", { timeout: 10_000 });

  // Modelo de triagem por área: cria regras DESLIGADAS.
  const tp = page.getByTestId("triage-panel");
  await tp.getByTestId("triage-trabalhista").getByLabel("Atendente responsável").selectOption({ index: 1 });
  await tp.getByRole("button", { name: "Criar regras (desligadas)" }).click();
  await expect(tp.getByText(/Criadas \(desligadas\): Trabalhista/)).toBeVisible({ timeout: 10_000 });

  // Menu de triagem: montar pelo modelo, salvar, receber conversa nova e responder o número.
  await page.goto("/atendimento/configuracoes");
  const bp = page.getByTestId("bot-panel");
  await bp.getByRole("button", { name: "Usar modelo para escritório de advocacia" }).click();
  await expect(bp.getByTestId("bt-preview")).toContainText("1 - Já sou cliente e quero saber do meu processo");
  await bp.getByLabel("Menu de triagem ligado").check();
  await bp.getByRole("button", { name: "Salvar menu de triagem" }).click();
  await expect(bp.getByText("Menu de triagem salvo.")).toBeVisible({ timeout: 10_000 });
  const sendIn = async (mid: string, text: string) => {
    const e = inbound(pnid, { id: mid, from: "5571988882222", name: "Lucia Menu", text });
    const r = await request.post("/api/whatsapp/webhook", { data: e.body, headers: { "content-type": "application/json", "x-hub-signature-256": e.signature } });
    expect(r.status()).toBe(200);
  };
  await sendIn(`wamid.E2ED${id}`, "Oi, bom dia");
  await sendIn(`wamid.E2EE${id}`, "3");
  await page.goto("/atendimento");
  await page.getByTestId("wa-list").locator("li", { hasText: "Lucia Menu" }).click();
  await expect(page.getByTestId("wa-msg-out").getByText(/Você falou com o escritório/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("wa-msg-out").getByText(/encaminhar para o financeiro/)).toBeVisible();
  await expect(page.getByTestId("wa-msg-note").getByText(/Triagem concluída: opção “Financeiro \/ honorários”/)).toBeVisible();
  await page.goto("/atendimento");
  await page.getByTestId("wa-list").getByText("Maria Teste").click();

  // Atribuir a mim e filtrar "Minhas".
  await page.getByLabel("Responsável", { exact: true }).selectOption({ label: `Dona zap${id} (eu)` });
  await expect(page.getByTestId("wa-list").locator("li", { hasText: "Maria Teste" }).getByText(`Dona zap${id}`)).toBeVisible();
  await page.getByRole("link", { name: "Minhas" }).click();
  await expect(page.getByTestId("wa-list").getByText("Maria Teste")).toBeVisible();
  await page.getByRole("link", { name: "Sem responsável" }).click();
  await expect(page.getByText("Nenhuma conversa.")).toBeVisible();

  // Encerrar.
  await page.getByRole("link", { name: "Abertas" }).click();
  await page.getByTestId("wa-list").getByText("Maria Teste").click();
  await page.getByLabel("Situação do atendimento",{exact:true}).selectOption("WAITING");
  await expect(page.getByTestId("wa-status")).toHaveText("Aguardando");
  await page.getByText("Registrar ligação",{exact:true}).click();
  await page.getByLabel("Resultado da ligação").selectOption("MISSED");
  await page.getByLabel("Observação da ligação").fill("Retornar a ligação amanhã");
  await page.getByRole("button",{name:"Salvar registro da ligação",exact:true}).click();
  await expect(page.getByTestId("wa-msg-note").getByText(/Registro manual de ligação recebida: não atendida/)).toBeVisible();
  await page.screenshot({path:"/tmp/legalos-chat-status-ligacoes.png",fullPage:true});
  await page.getByRole("button", { name: "Encerrar" }).click();
  await page.getByRole("link", { name: "Encerradas" }).click();
  await expect(page.getByTestId("wa-list").getByText("Maria Teste")).toBeVisible();
});

test("WhatsApp: o menu mostra Atendimento e quem não tem permissão não entra nas configurações", async ({ page }) => {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona menu${id}`);
  await page.getByLabel("E-mail").fill(`dona-menu-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca menu ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();
  // O atendimento é o lugar próprio "LegalOS Chat", fora do menu do Func.
  await expect(page.getByTestId("space-chat").first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navegação Func" }).first().getByRole("link", { name: /Conversas/ })).toHaveCount(0);
  await page.getByTestId("space-chat").first().click();
  await expect(page).toHaveURL(/\/atendimento$/);
  await expect(page.locator("[data-space]").first()).toHaveAttribute("data-space", "chat");
  const chatNav = page.getByRole("navigation", { name: "Navegação Chat" }).first();
  await expect(chatNav.getByRole("link", { name: /Conversas/ })).toBeVisible();
  await expect(chatNav.getByRole("link", { name: /Configurar o Chat/ })).toBeVisible();
  await expect(chatNav.getByRole("link", { name: /^Processos/ })).toHaveCount(0);
  await chatNav.getByRole("link", { name: /Configurar o Chat/ }).click();
  await expect(page.getByTestId("wa-config")).toBeVisible();
  await expect(page.locator("[data-space]").first()).toHaveAttribute("data-space", "chat");
  await page.getByTestId("space-func").first().click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();
});

test("WhatsApp por QR-Code: exige 2FA e aceite do risco, mostra o QR, conecta e atende sem janela de 24h", async ({ page }) => {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona qr${id}`);
  await page.getByLabel("E-mail").fill(`dona-qr-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca qr ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();

  await page.goto("/atendimento/configuracoes");
  await expect(page.getByText(/contraria os Termos de Uso do WhatsApp/)).toBeVisible();
  const gen = page.getByRole("button", { name: "Gerar QR-Code" });
  await expect(gen).toBeDisabled(); // sem aceitar o risco
  await page.getByLabel(/Entendi os riscos/).check();
  await gen.click();
  await expect(page.getByText(/verificação em duas etapas/i).first()).toBeVisible(); // sem 2FA

  await page.goto("/conta");
  await page.getByRole("button", { name: "Ativar verificação em duas etapas" }).click();
  const secret = (await page.getByTestId("mfa-secret").textContent())!.trim();
  await page.getByLabel("Código de 6 dígitos").fill(totpCode(secret, totpStep()));
  await page.getByRole("button", { name: "Ativar", exact: true }).click();
  await page.getByRole("button", { name: "Já guardei os códigos" }).click();

  await page.goto("/atendimento/configuracoes");
  await page.getByLabel(/Entendi os riscos/).check();
  await page.getByRole("button", { name: "Gerar QR-Code" }).click();
  await expect(page.getByTestId("qr-image")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("qr-state")).toContainText("Aguardando a leitura");
  await expect(page.getByTestId("qr-state")).toContainText("Conectado", { timeout: 20_000 }); // o driver falso "lê" o QR
  await expect(page.getByTestId("qr-state")).toContainText("+5571999990000");
  await expect(page.getByText("QR-Code (não oficial)")).toBeVisible();
  await expect(page.getByText(/não há modelos nem janela de 24 horas/)).toBeVisible();

  await page.goto("/atendimento");
  await expect(page.getByText(/ainda não foi conectado/)).toHaveCount(0);

  await page.goto("/atendimento/configuracoes");
  page.once("dialog",d=>void d.accept());
  await page.getByRole("button",{name:"Trocar aparelho ou número (preservar histórico)",exact:true}).click();
  await expect(page.getByTestId("qr-state")).toContainText("Conectado",{timeout:20000});
  await page.screenshot({path:"/tmp/legalos-chat-pareamento.png",fullPage:true});
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Desconectar o aparelho" }).click();
  await expect(page.getByTestId("qr-state")).toContainText("Desconectado");
});


test("Campanha de 2.601 contatos: seleção completa, rascunho e relatório paginado sem disparar",async({page})=>{
 const id=uid(),email=`campanha-${id}@example.test`;
 await page.goto("/register");await page.getByLabel("Nome completo").fill(`Pessoa campanha ${id}`);await page.getByLabel("E-mail").fill(email);await page.getByLabel("Senha",{exact:true}).fill(password);await page.getByRole("button",{name:"Criar conta",exact:true}).click();await page.getByLabel("Nome do escritório").fill(`Banca campanhas ${id}`);await page.getByRole("button",{name:"Criar escritório",exact:true}).click();await expect(page.getByRole("heading",{name:/Olá/})).toBeVisible();
 const url=process.env.TEST_DATABASE_URL??"postgresql://legalos:legalos_dev@localhost:5432/legalos_test";if(!/test/i.test(new URL(url).pathname))throw Error("Fixture exige banco de testes");const database=new Client({connectionString:url});await database.connect();
 try{
 const {rows:[person]}=await database.query('SELECT m.organization_id FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.email=$1',[email]);
 await database.query("INSERT INTO whatsapp_accounts(id,organization_id,label,provider,qr_state,risk_ack_at) VALUES(gen_random_uuid(),$1,'Número de teste','QR','DISCONNECTED',now())",[person.organization_id]);
 await database.query("INSERT INTO whatsapp_extras_settings(organization_id,campaigns_enabled) VALUES($1,true)",[person.organization_id]);
 await database.query("INSERT INTO clients(id,organization_id,type,name,phone) SELECT gen_random_uuid(),$1,'PERSON','Campanha '||lpad(i::text,4,'0'),'55719'||lpad(i::text,7,'0') FROM generate_series(1,2601) i",[person.organization_id]);
 await page.goto("/atendimento/configuracoes");const panel=page.getByTestId("campaigns-panel");await panel.getByLabel("Nome (só para vocês)").fill(`Aviso de recesso ${id}`);await panel.getByLabel("Mensagem (use {nome})").fill("Olá {nome}, aviso de recesso.");await expect(panel.getByText(/2601 clientes no filtro/)).toBeVisible();await panel.getByRole("button",{name:"Selecionar todos do filtro",exact:true}).click();await expect(panel.getByText(/2601 selecionado/)).toBeVisible();await panel.getByRole("button",{name:"Criar rascunho",exact:true}).click();await expect(panel.getByText(`Aviso de recesso ${id}`,{exact:true})).toBeVisible();await panel.getByRole("button",{name:"Relatório",exact:true}).click();await expect(panel.getByText(/1\/27 · 2601 destinatários/)).toBeVisible();await panel.getByRole("button",{name:"Próxima",exact:true}).click();await expect(panel.getByText(/2\/27 · 2601 destinatários/)).toBeVisible();
 const {rows:[counts]}=await database.query('SELECT (SELECT count(*) FROM whatsapp_campaign_recipients WHERE organization_id=$1)::int AS recipients,(SELECT count(*) FROM whatsapp_messages WHERE organization_id=$1)::int AS messages',[person.organization_id]);expect(counts).toEqual({recipients:2601,messages:0});await panel.screenshot({path:"/tmp/legalos-chat-campanha-2601.png"});
 }finally{await database.end();}
});
