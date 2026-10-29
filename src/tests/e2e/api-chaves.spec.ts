import { expect, test } from "@playwright/test";
import { totpCode, totpStep } from "../../lib/security/totp";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);

test("Chaves de API: criar na tela (exige 2FA), usar a API sem cookie, token só aparece uma vez e revogar derruba o acesso", async ({ page, playwright, baseURL }) => {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona api${id}`);
  await page.getByLabel("E-mail").fill(`dona-api-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca api ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Bom dia/ })).toBeVisible();

  // sem 2FA, criar chave é recusado com explicação
  await page.goto("/integracoes");
  await page.getByLabel("Nome (quem vai usar)").fill("Planilha do escritório");
  await page.getByLabel("Ler processos").check();
  await page.getByRole("button", { name: "Criar chave de API" }).click();
  await expect(page.getByText(/verificação em duas etapas/i).first()).toBeVisible();

  // ativa o 2FA
  await page.goto("/conta");
  await page.getByRole("button", { name: "Ativar verificação em duas etapas" }).click();
  const secret = (await page.getByTestId("mfa-secret").textContent())!.trim();
  await page.getByLabel("Código de 6 dígitos").fill(totpCode(secret, totpStep()));
  await page.getByRole("button", { name: "Ativar", exact: true }).click();
  await page.getByRole("button", { name: "Já guardei os códigos" }).click();

  await page.goto("/integracoes");
  await page.getByLabel("Nome (quem vai usar)").fill("Planilha do escritório");
  await page.getByLabel("Ler processos").check();
  await page.getByRole("button", { name: "Criar chave de API" }).click();
  const token = (await page.getByTestId("new-api-key").textContent())!.trim();
  expect(token).toMatch(/^lgos_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/);

  // cliente HTTP SEM cookies: prova que /api/v1 não é barrado pelo login
  const anon = await playwright.request.newContext({ baseURL });
  const noKey = await anon.get("/api/v1/me", { maxRedirects: 0 });
  expect(noKey.status()).toBe(401);
  expect((await noKey.json()).error.code).toBe("unauthorized");
  const ok = await anon.get("/api/v1/me", { headers: { authorization: `Bearer ${token}` }, maxRedirects: 0 });
  expect(ok.status()).toBe(200);
  expect((await ok.json()).data.scopes).toEqual(["cases:read"]);
  expect((await anon.get("/api/v1/clients", { headers: { authorization: `Bearer ${token}` }, maxRedirects: 0 })).status()).toBe(403);
  // as rotas do agendador também não podem ser barradas pelo login
  expect((await anon.post("/api/cron/mni", { maxRedirects: 0 })).status()).not.toBe(307);

  // recarregar a página não mostra o token de novo; só o prefixo
  await page.reload();
  await expect(page.getByTestId("new-api-key")).toHaveCount(0);
  await expect(page.getByText(`lgos_${token.split("_")[1]}_…`)).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Revogar" }).click();
  await expect(page.getByText("Revogada")).toBeVisible();
  expect((await anon.get("/api/v1/me", { headers: { authorization: `Bearer ${token}` }, maxRedirects: 0 })).status()).toBe(401);
  await anon.dispose();
});
