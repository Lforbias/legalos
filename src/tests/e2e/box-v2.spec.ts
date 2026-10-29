import { expect, test } from "@playwright/test";
import { djenItem, djenPage } from "../fixtures/djen-samples";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);
const DJEN_PORT = 3197;

/** Servidor DJEN FICTÍCIO local: respostas dele nunca contam como prova de funcionamento (o LegalOS sabe disso). */
async function fakeDjen() {
  const http = await import("node:http");
  const state = { mode: "ok" as "ok" | "down", calls: 0 };
  const server = http.createServer((req, res) => {
    state.calls++;
    req.resume();
    if (state.mode === "down") {
      res.writeHead(503, { "content-type": "text/plain" });
      res.end("indisponível");
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(djenPage([djenItem({ id: 990001, numero_processo: "", texto: "Intimação sintética do teste e2e: manifeste-se no prazo legal sobre o laudo juntado." })]));
  });
  await new Promise<void>((resolve) => server.listen(DJEN_PORT, "127.0.0.1", resolve));
  return { state, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

test("Box 2.0: assistente, visão geral, conexões e saúde mostram só o que foi comprovado", async ({ page }) => {
  test.setTimeout(150_000);
  const djen = await fakeDjen();
  try {
    const id = uid();
    await page.goto("/register");
    await page.getByLabel("Nome completo").fill(`Dona v2 ${id}`);
    await page.getByLabel("E-mail").fill(`dona-v2-${id}@example.test`);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Criar conta" }).click();
    await page.getByLabel("Nome do escritório").fill(`Banca v2 ${id}`);
    await page.getByRole("button", { name: "Criar escritório" }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    // navegação nova do Box, sem as páginas antigas duplicadas
    await page.goto("/box");
    await expect(page.getByTestId("box-dashboard")).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Navegação Box" }).first();
    for (const name of ["Visão geral do Box", "Caixa de entrada", "Processos", "Peticionamento", "Conexões Judiciais", "Operação e Saúde", "Configurações do Box"]) await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
    for (const name of [/Certificados digitais/, /Conectar PJe/, /^Monitoramento/, /^Integrações/]) await expect(nav.getByRole("link", { name })).toHaveCount(0);

    // escritório novo: nada configurado e a tela diz isso com todas as letras
    await expect(page.getByTestId("setup-card")).toContainText("Cadastre o advogado e a OAB");
    await expect(page.getByText(/Nenhuma fonte configurada: nenhuma intimação chega sozinha/)).toBeVisible();
    await expect(page.getByTestId("no-communications")).toBeVisible();

    await page.screenshot({ path: "/tmp/legalos-box-v2-0-overview-vazio.png", fullPage: true });
    // assistente — A: identificação (com validação de duplicidade)
    await page.getByRole("link", { name: "Começar" }).click();
    await expect(page).toHaveURL(/\/box\/configurar/);
    await page.getByLabel("Nome do advogado").fill("Dra. E2E");
    await page.getByLabel("Número da OAB").fill("123456");
    await page.getByRole("button", { name: "Cadastrar advogado", exact: true }).click();
    await expect(page.getByText("Advogado cadastrado.")).toBeVisible();
    await expect(page.getByTestId("wizard-professionals")).toContainText("Dra. E2E");
    await page.getByLabel("Nome do advogado").fill("Dra. E2E de novo");
    await page.getByLabel("Número da OAB").fill("123456");
    await page.getByRole("button", { name: "Cadastrar outro", exact: true }).click();
    await expect(page.getByText("Essa OAB já está cadastrada.")).toBeVisible();

    await page.screenshot({ path: "/tmp/legalos-box-v2-1-assistente-a.png", fullPage: true });
    // B: publicações — consulta feita de verdade (mas contra um servidor FICTÍCIO: não pode virar "verificado")
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.getByRole("button", { name: "Ligar e consultar agora", exact: true }).click();
    await expect(page.getByText("Consulta concluída.")).toBeVisible();
    await expect(page.getByText(/1 nova\(s\) na Caixa de Entrada/)).toBeVisible();
    await expect(page.getByText("Ligado, sem consulta real concluída")).toBeVisible();
    await expect(page.getByText("Verificado com consulta real")).toHaveCount(0);
    expect(djen.state.calls).toBeGreaterThan(0);

    await page.screenshot({ path: "/tmp/legalos-box-v2-2-assistente-b.png", fullPage: true });
    // C: acesso privado é opcional e honesto sobre limites
    await page.getByRole("button", { name: "Continuar mesmo assim", exact: true }).click();
    await expect(page.getByText(/não contorna captcha/)).toBeVisible();
    await page.getByRole("button", { name: "Pular por agora", exact: true }).click();

    await page.screenshot({ path: "/tmp/legalos-box-v2-3-assistente-c.png", fullPage: true });
    // D: conferência — estado vem de evidência; servidor fictício não prova nada
    const validation = page.getByTestId("wizard-validation");
    await expect(validation).toContainText("Não homologado");
    await expect(validation).not.toContainText("Operacional");
    await page.getByRole("button", { name: "Ver o resumo", exact: true }).click();

    await page.screenshot({ path: "/tmp/legalos-box-v2-4-assistente-d.png", fullPage: true });
    // E: resumo permite terminar com pendências
    await expect(page.getByTestId("wizard-summary")).toContainText("Funcionando (0)");
    await expect(page.getByTestId("wizard-summary")).toContainText("Pendente (1)");
    await page.getByTestId("wizard-finish").click();
    await expect(page).toHaveURL(/\/box$/);

    await page.screenshot({ path: "/tmp/legalos-box-v2-5-assistente-e.png", fullPage: true });
    // visão geral com dados reais: a publicação capturada, com estados separados
    const latest = page.getByTestId("latest-communications");
    await expect(latest).toContainText("Publicação no DJEN");
    await expect(latest).toContainText("Não vista no LegalOS");
    await expect(latest).toContainText("Sem ciência oficial");
    await expect(page.getByTestId("overview-sources")).toContainText("ainda não há uma verificação real");

    await page.screenshot({ path: "/tmp/legalos-box-v2-6-overview.png", fullPage: true });
    // Conexões Judiciais: estado honesto, detalhes técnicos só para administrador, nova consulta com resultado
    await nav.getByRole("link", { name: "Conexões Judiciais", exact: true }).click();
    await expect(page.getByTestId("box-connections")).toBeVisible();
    const card = page.locator("[data-testid^='connection-DJEN-']").first();
    await expect(card).toContainText("Não homologado");
    await expect(card).toContainText("Dra. E2E");
    await expect(card.getByTestId("technical-details")).toBeVisible();
    await expect(page.getByTestId("coverage-matrix")).toBeVisible();
    await card.getByRole("button", { name: "Consultar agora" }).click();
    await expect(card.getByText(/Consulta concluída\./)).toBeVisible();

    await page.screenshot({ path: "/tmp/legalos-box-v2-7-conexoes.png", fullPage: true });
    // DJEN fora do ar: a tela explica em português simples e a fonte não fica "em dia"
    djen.state.mode = "down";
    await card.getByRole("button", { name: "Consultar agora" }).click();
    await expect(card.getByText(/A consulta não foi concluída/)).toBeVisible();
    await expect(card.getByText(/fora do ar ou muito lento/)).toBeVisible();
    await expect(card.getByText(/SOAP|WSDL|endpoint/i)).toHaveCount(0);

    await page.screenshot({ path: "/tmp/legalos-box-v2-8-conexoes-falha.png", fullPage: true });
    // Operação e Saúde: alertas, rotinas e execuções (inclusive a que falhou)
    await nav.getByRole("link", { name: "Operação e Saúde", exact: true }).click();
    await expect(page.getByTestId("box-health")).toBeVisible();
    await expect(page.getByTestId("source-health")).toContainText("Dra. E2E");
    await expect(page.getByTestId("jobs")).toContainText("Captura do DJEN");
    await expect(page.getByTestId("runs")).toContainText("Configuração");
    await expect(page.getByTestId("runs")).toContainText("Falhou");
    await page.getByRole("button", { name: "Reavaliar agora" }).click();
    await expect(page.getByText(/Verificação feita agora/)).toBeVisible();

    await page.screenshot({ path: "/tmp/legalos-box-v2-9-saude.png", fullPage: true });
    // Processos e Configurações
    await nav.getByRole("link", { name: "Processos", exact: true }).click();
    await expect(page.getByTestId("box-cases")).toBeVisible();
    await expect(page.getByTestId("no-box-cases")).toBeVisible();
    await nav.getByRole("link", { name: "Configurações do Box", exact: true }).click();
    await expect(page.getByTestId("professionals")).toContainText("Dra. E2E");
    await expect(page.getByTestId("professionals")).toContainText("Monitorado, sem verificação real");

    await page.screenshot({ path: "/tmp/legalos-box-v2-10-configuracoes.png", fullPage: true });
    // telas antigas continuam existindo para quem as usa por endereço
    await page.goto("/integracoes");
    await expect(page.getByRole("heading", { name: /Integrações/ }).first()).toBeVisible();
    await page.screenshot({ path: "/tmp/legalos-box-v2.png", fullPage: true });
  } finally {
    await djen.close();
  }
});
