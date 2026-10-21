import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { totpCode, totpStep } from "../../lib/security/totp";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);
const DB = process.env.TEST_DATABASE_URL ?? "postgresql://legalos:legalos_dev@localhost:5432/legalos_test";

async function signUp(page: Page, label: string) {
  const id = uid();
  const email = `${label}-${id}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona ${label}${id}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca ${label} ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();
  return { id, email };
}
async function grantAdmin(email: string) {
  const c = new Client({ connectionString: DB });
  await c.connect();
  await c.query("INSERT INTO platform_admins (user_id) SELECT id FROM users WHERE email = $1 ON CONFLICT DO NOTHING", [email]);
  await c.end();
}

test("painel de admin: usuário comum recebe 404", async ({ page }) => {
  await signUp(page, "adm-comum");
  const res = await page.goto("/admin");
  expect(res?.status()).toBe(404);
  expect((await page.goto("/admin/escritorios"))?.status()).toBe(404);
});

test("painel de admin: super-admin sem 2FA vai ativar o 2FA; com 2FA vê as telas e suspende e reativa um escritório", async ({ page, browser }) => {
  const alvo = await browser.newPage();
  const target = await signUp(alvo, "adm-alvo");

  const { email } = await signUp(page, "adm-super");
  await grantAdmin(email);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/conta/);

  await page.getByRole("button", { name: "Ativar verificação em duas etapas" }).click();
  const secret = (await page.getByTestId("mfa-secret").textContent())!.trim();
  await page.getByLabel("Código de 6 dígitos").fill(totpCode(secret, totpStep()));
  await page.getByRole("button", { name: "Ativar", exact: true }).click();
  await expect(page.getByTestId("recovery-codes").locator("li")).toHaveCount(10);
  await page.getByRole("button", { name: "Já guardei os códigos" }).click();

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Visão geral da plataforma" })).toBeVisible();
  await expect(page.getByText("Administração da plataforma")).toBeVisible();

  await page.goto(`/admin/escritorios?q=${encodeURIComponent(`Banca adm-alvo ${target.id}`)}`);
  await expect(page.getByText(`Banca adm-alvo ${target.id}`)).toBeVisible();
  await page.getByRole("button", { name: "Suspender…" }).click();
  await page.getByLabel("Motivo (fica registrado)").fill("inadimplência (teste)");
  await page.getByRole("button", { name: "Confirmar suspensão" }).click();
  await expect(page.getByText("Suspenso", { exact: true })).toBeVisible();

  // o escritório suspenso perde o acesso na hora
  await alvo.goto("/");
  await expect(alvo).toHaveURL(/\/suspenso/);
  await expect(alvo.getByRole("heading", { name: "Acesso suspenso" })).toBeVisible();

  await page.getByRole("button", { name: "Reativar" }).click();
  await expect(page.getByText("Ativo", { exact: true })).toBeVisible();
  await alvo.goto("/");
  await expect(alvo.getByRole("heading", { name: /Olá/ })).toBeVisible();

  // plano e assinatura: cancelar pela administração pausa só o que aumenta uso e avisa o escritório
  await alvo.goto("/configuracoes");
  await expect(alvo.getByTestId("plan-card")).toContainText("Profissional");
  await page.getByRole("button", { name: "Plano…" }).click();
  const form = page.locator("[data-testid^=sub-form-]");
  await form.getByLabel("Situação").selectOption("CANCELED");
  await form.getByLabel("Observação (fica registrada)").fill("teste e2e");
  await form.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Cancelada").first()).toBeVisible();
  await alvo.goto("/configuracoes");
  await expect(alvo.getByTestId("plan-banner")).toContainText("cancelada");
  await expect(alvo.getByTestId("plan-card")).toContainText("Cancelada");
  await alvo.goto("/clientes");
  await expect(alvo.getByRole("heading", { name: "Clientes" })).toBeVisible();

  // cobrança automática desligada: o escritório vê o aviso (sem simular nada); a administração define preço e limites
  await alvo.goto("/configuracoes");
  await expect(alvo.getByTestId("billing-card")).toBeVisible();
  await expect(alvo.getByTestId("billing-off")).toContainText("ainda não foi ativada");
  await page.goto("/admin/planos");
  await expect(page.getByRole("heading", { name: "Planos e preços", exact: true })).toBeVisible();
  const prof = page.getByTestId("plan-edit-profissional");
  await prof.getByLabel("Preço mensal (R$)").fill("149,90");
  await prof.getByRole("button", { name: "Salvar plano" }).click();
  await expect(prof.getByText("Plano salvo.")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("plan-edit-profissional").getByLabel("Preço mensal (R$)")).toHaveValue("149,90");

  for (const [path, title] of [["/admin/usuarios", "Usuários"], ["/admin/auditoria", "Auditoria"], ["/admin/saude", "Saúde e integrações"]] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  await page.goto("/admin/auditoria?admin=1");
  await expect(page.getByText("platform.org_suspend").first()).toBeVisible();
});
