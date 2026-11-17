import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { Client } from "pg";

export function testDatabaseUrl() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://legalos:legalos_dev@localhost:5432/legalos_test";
  if (!/test/i.test(new URL(url).pathname)) throw new Error("A confirmação de e-mail do E2E só roda contra um banco cujo nome contenha 'test'.");
  return url;
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Confirma o e-mail da pessoa logada pela página real `/verify-email`.
 * Nos servidores de teste o e-mail não é entregue (driver de console em modo produção não registra o corpo),
 * então só o "transporte" é simulado: emitimos um token VERIFY_EMAIL válido para o usuário desta sessão,
 * igual ao que iria no e-mail, e a confirmação passa pelo clique e pela ação reais do sistema.
 */
export async function confirmEmailOfCurrentUser(page: Page) {
  const sessionCookie = (await page.context().cookies()).find((cookie) => /lo_session$/.test(cookie.name));
  if (!sessionCookie) throw new Error("Nenhuma sessão ativa para confirmar o e-mail.");
  const token = randomBytes(32).toString("base64url");
  const database = new Client({ connectionString: testDatabaseUrl() });
  await database.connect();
  try {
    const { rows } = await database.query<{ user_id: string }>("SELECT user_id FROM sessions WHERE token_hash = $1 AND revoked_at IS NULL", [sha256(sessionCookie.value)]);
    if (!rows[0]) throw new Error("Sessão do navegador não encontrada no banco de testes.");
    await database.query("INSERT INTO email_tokens (id, user_id, type, token_hash, expires_at) VALUES ($1, $2, 'VERIFY_EMAIL', $3, now() + interval '1 hour')", [randomUUID(), rows[0].user_id, sha256(token)]);
  } finally {
    await database.end();
  }
  await page.goto(`/verify-email?token=${token}`);
  await page.getByRole("button", { name: "Confirmar meu e-mail", exact: true }).click();
  await expect(page.getByText("E-mail confirmado com sucesso.")).toBeVisible();
}

export const WELCOME_PROFILES = {
  solo: /Advogado\(a\) autônomo\(a\)/,
  lawFirm: /Escritório de advocacia/,
  inHouse: /Departamento jurídico/,
} as const;

/**
 * Percorre o onboarding LegalOS Welcome logo depois do cadastro:
 * Perfil (obrigatório) → Diagnóstico (pulado) → Escritório, com confirmação de e-mail antes de criar.
 * Ao voltar da confirmação, o assistente precisa retomar na etapa 3 com o progresso salvo.
 */
export async function completeWelcomeOnboarding(page: Page, officeName: string, options: { profile?: keyof typeof WELCOME_PROFILES } = {}) {
  await expect(page).toHaveURL(/\/onboarding(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Como você trabalha?", exact: true })).toBeVisible();
  const proceed = page.getByRole("button", { name: "Continuar", exact: true });
  await expect(proceed).toBeDisabled();
  await page.getByRole("radio", { name: WELCOME_PROFILES[options.profile ?? "lawFirm"] }).check();
  await proceed.click();

  await expect(page.getByRole("heading", { name: "Um diagnóstico rápido", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pular diagnóstico", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Configure seu escritório", exact: true })).toBeVisible();
  const create = page.getByRole("button", { name: "Criar escritório e começar", exact: true });
  // sem e-mail confirmado o escritório não pode ser criado
  await expect(create).toBeDisabled();

  await confirmEmailOfCurrentUser(page);
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "Configure seu escritório", exact: true })).toBeVisible();
  await page.getByLabel("Nome do escritório", { exact: true }).fill(officeName);
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
}
