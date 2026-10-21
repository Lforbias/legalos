import { expect, test } from "@playwright/test";
import { totpCode, totpStep } from "../../lib/security/totp";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);

test("Webhooks: exige 2FA, recusa endereço inseguro, mostra o segredo uma vez, teste falho é explicado e remover funciona", async ({ page }) => {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona hook${id}`);
  await page.getByLabel("E-mail").fill(`dona-hook-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca hook ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();

  await page.goto("/integracoes");
  await page.getByLabel("Nome (para que serve)").fill("Planilha de intimações");
  await page.getByLabel("Endereço que receberá os avisos (https://…)").fill("https://exemplo.invalid/legalos");
  await page.getByLabel("Intimação registrada").check();
  await page.getByRole("button", { name: "Criar webhook" }).click();
  await expect(page.getByText(/verificação em duas etapas/i).first()).toBeVisible();

  await page.goto("/conta");
  await page.getByRole("button", { name: "Ativar verificação em duas etapas" }).click();
  const secret = (await page.getByTestId("mfa-secret").textContent())!.trim();
  await page.getByLabel("Código de 6 dígitos").fill(totpCode(secret, totpStep()));
  await page.getByRole("button", { name: "Ativar", exact: true }).click();
  await page.getByRole("button", { name: "Já guardei os códigos" }).click();

  await page.goto("/integracoes");
  await page.getByLabel("Nome (para que serve)").fill("Planilha de intimações");
  await page.getByLabel("Endereço que receberá os avisos (https://…)").fill("http://exemplo.com.br/legalos");
  await page.getByLabel("Intimação registrada").check();
  await page.getByRole("button", { name: "Criar webhook" }).click();
  await expect(page.getByText(/deve começar com https/)).toBeVisible();

  await page.getByLabel("Endereço que receberá os avisos (https://…)").fill("https://exemplo.invalid/legalos");
  await page.getByRole("button", { name: "Criar webhook" }).click();
  const whsec = (await page.getByTestId("new-webhook-secret").textContent())!.trim();
  expect(whsec).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);

  await page.reload();
  await expect(page.getByTestId("new-webhook-secret")).toHaveCount(0);
  await expect(page.getByText("Planilha de intimações")).toBeVisible();

  await page.getByRole("button", { name: "Enviar teste" }).click();
  await expect(page.getByText(/Teste falhou/)).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Remover", exact: true }).first().click();
  await expect(page.getByText("Nenhum webhook cadastrado.")).toBeVisible();
});
