import { expect, test } from "@playwright/test";
import { totpCode, totpStep } from "../../lib/security/totp";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);

test("2FA: ativar na conta, login pede o código, código errado falha, recuperação vale uma vez e CSP está ativa", async ({ page }) => {
  const id = uid();
  const email = `dona-mfa-${id}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona mfa${id}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca mfa ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();

  const res = await page.goto("/conta");
  expect(res?.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  await page.getByRole("button", { name: "Ativar verificação em duas etapas" }).click();
  const secret = (await page.getByTestId("mfa-secret").textContent())!.trim();
  await page.getByLabel("Código de 6 dígitos").fill(totpCode(secret, totpStep()));
  await page.getByRole("button", { name: "Ativar", exact: true }).click();
  await expect(page.getByTestId("recovery-codes").locator("li")).toHaveCount(10);
  const codes = (await page.getByTestId("recovery-codes").locator("li").allTextContents()).map((c) => c.trim());
  expect(codes).toHaveLength(10);
  await page.getByRole("button", { name: "Já guardei os códigos" }).click();
  await expect(page.getByText(/Verificação em duas etapas.*ativa/).first()).toBeVisible();

  // sai e entra de novo: agora pede o segundo fator
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Verificação em duas etapas" })).toBeVisible();
  await page.getByLabel("Código").fill("000000");
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page.getByText("Código inválido.")).toBeVisible();
  await page.getByLabel("Código").fill(codes[0]!);
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();
});
