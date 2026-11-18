import { expect, test, type Browser, type Page } from "@playwright/test";
import { completeWelcomeOnboarding } from "./support/welcome";

/**
 * Videoconferência do Cowork (projeto "video", servidor com LiveKit configurado).
 * - Sempre: cabeçalhos (câmera/tela só na página da reunião, CSP com o servidor de vídeo), controles só para
 *   convidados com a reunião em andamento, e erro honesto quando o servidor de mídia não responde.
 * - Com LIVEKIT_E2E_REAL=1 (livekit-server local rodando): chamada real entre dois navegadores com mídia simulada,
 *   câmera, tela, anfitrião removendo participante e encerramento.
 */
const password = "SenhaForte123";
const REAL = process.env.LIVEKIT_E2E_REAL === "1";

async function register(page: Page, name: string, email: string) {
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(name);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
}

async function setup(browser: Browser, baseURL: string) {
  const id = Math.random().toString(36).slice(2, 8);
  const hostCtx = await browser.newContext({ baseURL });
  const host = await hostCtx.newPage();
  await register(host, "Talita Vídeo", `video-dona-${id}@example.test`);
  await completeWelcomeOnboarding(host, `Escritório Vídeo ${id}`);
  await host.goto("/configuracoes/equipe");
  await host.getByRole("button", { name: "Convidar usuário" }).click();
  await host.getByLabel("E-mail", { exact: true }).fill(`video-bia-${id}@example.test`);
  await host.getByLabel("Perfil", { exact: true }).selectOption({ label: "Advogado" });
  await host.getByRole("button", { name: "Gerar convite" }).click();
  const link = (await host.locator("code").first().innerText()).trim();
  const guestCtx = await browser.newContext({ baseURL });
  const guest = await guestCtx.newPage();
  await guest.goto(link);
  await guest.getByRole("link", { name: "Criar conta para aceitar" }).click();
  await guest.getByLabel("Nome completo").fill("Bia Vídeo");
  await guest.getByLabel("Senha", { exact: true }).fill(password);
  await guest.getByRole("button", { name: "Criar conta" }).click();
  await expect(guest).toHaveURL(/\/dashboard(?:\?|$)/);
  await host.goto("/cowork/reunioes/nova");
  await host.getByTestId("meeting-title").fill(`Chamada ${id}`);
  await host.getByTestId("cowork-person-option").filter({ hasText: "Bia Vídeo" }).click();
  await host.getByTestId("meeting-submit").click();
  await expect(host).toHaveURL(/\/cowork\/reunioes\/[0-9a-f-]{36}$/);
  return { id, host, guest, hostCtx, guestCtx, url: new URL(host.url()).pathname };
}

test("Vídeo do Cowork: permissões do navegador, entrada só com reunião em andamento e erro honesto", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const { host, guest, hostCtx, guestCtx, url } = await setup(browser, baseURL!);
  // Agendada: nenhum controle de mídia; a página explica quando a chamada abre.
  await expect(host.getByTestId("meeting-video-waiting")).toBeVisible();
  await expect(host.getByTestId("video-join")).toHaveCount(0);
  const res = await host.goto(url);
  const pp = res!.headers()["permissions-policy"] ?? "";
  expect(pp).toContain("camera=(self)");
  expect(pp).toContain("display-capture=(self)");
  expect(res!.headers()["content-security-policy"]).toMatch(/connect-src 'self' ws:\/\/localhost:\d+ http:\/\/localhost:\d+/);
  const other = await host.request.get("/dashboard"); // fora do Cowork a câmera continua bloqueada
  expect(other.headers()["permissions-policy"]).toContain("camera=()");
  await host.getByTestId("meeting-start").click();
  await expect(host.getByTestId("video-join")).toBeVisible();
  await guest.goto(url);
  await expect(guest.getByTestId("video-join")).toBeVisible();
  if (!REAL) {
    // Sem servidor de mídia: nada de "conectado" simulado.
    await guest.getByTestId("video-join").click();
    await expect(guest.getByTestId("video-room").getByRole("alert")).toContainText("Não foi possível conectar ao servidor de vídeo");
    await expect(guest.getByTestId("video-room")).toHaveAttribute("data-phase", "error");
    await expect(guest.getByTestId("video-tile")).toHaveCount(0);
  }
  await Promise.all([hostCtx.close(), guestCtx.close()]);
});

test("Vídeo do Cowork: chamada real entre dois navegadores (requer livekit-server local)", async ({ browser, baseURL }) => {
  test.skip(!REAL, "Defina LIVEKIT_E2E_REAL=1 com um livekit-server local para validar a mídia real.");
  test.setTimeout(240_000);
  const { host, guest, hostCtx, guestCtx, url } = await setup(browser, baseURL!);
  await host.getByTestId("meeting-start").click();
  await host.getByTestId("video-cam").click(); // entra com câmera
  await host.getByTestId("video-join").click();
  await expect(host.getByTestId("video-room")).toHaveAttribute("data-phase", "connected", { timeout: 30_000 });
  await guest.goto(url);
  await guest.getByTestId("video-join").click();
  await expect(guest.getByTestId("video-room")).toHaveAttribute("data-phase", "connected", { timeout: 30_000 });
  await expect(host.getByTestId("video-tile")).toHaveCount(2, { timeout: 20_000 });
  await expect(guest.getByTestId("video-tile")).toHaveCount(2);
  await expect(guest.getByTestId("video-count")).toHaveText("2 na chamada");
  // A câmera (simulada) da anfitriã chega à convidada como vídeo de verdade.
  await expect(guest.locator('[data-testid="video-tile"][data-local="0"] video')).toHaveCount(1, { timeout: 20_000 });
  await expect.poll(async () => guest.locator('[data-testid="video-tile"][data-local="0"] video').evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 }).toBeGreaterThan(0);
  // Microfone: desligar reflete no outro lado.
  await guest.getByTestId("video-mic").click();
  await expect(host.locator('[data-testid="video-tile"][data-local="0"]').getByLabel("Microfone desligado")).toBeVisible({ timeout: 15_000 });
  // Compartilhamento de tela (mídia simulada pelo Chromium).
  await host.getByTestId("video-screen-share").click();
  await expect(guest.getByTestId("video-screen")).toBeVisible({ timeout: 20_000 });
  await host.getByTestId("video-screen-share").click();
  await expect(guest.getByTestId("video-screen")).toHaveCount(0, { timeout: 20_000 });
  // Anfitriã remove a convidada; a convidada vê o motivo.
  await host.getByRole("button", { name: "Remover Bia Vídeo da chamada" }).click();
  await expect(guest.getByTestId("video-room").getByRole("alert")).toContainText("removeu você", { timeout: 15_000 });
  await expect(host.getByTestId("video-tile")).toHaveCount(1, { timeout: 15_000 });
  // Convidada volta; encerrar a reunião derruba a chamada de todos.
  await guest.getByTestId("video-join").click();
  await expect(guest.getByTestId("video-room")).toHaveAttribute("data-phase", "connected", { timeout: 30_000 });
  await host.getByTestId("meeting-end").click();
  await expect(guest.getByTestId("video-room").getByRole("alert")).toContainText("encerrada", { timeout: 15_000 });
  // Presença verificável: o webhook assinado do LiveKit (participant_joined) marcou a convidada como presente.
  await host.reload();
  await expect(host.getByLabel("Presença de Bia Vídeo")).toHaveValue("PRESENT");
  await Promise.all([hostCtx.close(), guestCtx.close()]);
});
