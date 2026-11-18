import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { confirmEmailOfCurrentUser } from "./support/welcome";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);
const DB = process.env.TEST_DATABASE_URL ?? "postgresql://legalos:legalos_dev@localhost:5432/legalos_test";

test("Welcome: perfil, diagnóstico respondido, retomada salva, presente validado no servidor e avaliação sem cobrança", async ({ page }) => {
  const id = uid();
  const email = `welcome-${id}@example.test`;
  const officeName = `Escritório Welcome ${id}`;
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Renata Welcome ${id}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();

  // Etapa 1 — Perfil: escolher o perfil é obrigatório e a OAB precisa vir completa
  await expect(page).toHaveURL(/\/onboarding(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Bem-vindo, Renata." })).toBeVisible();
  await expect(page.getByText(/Confirme seu e-mail pelo link enviado/)).toBeVisible();
  const proceed = page.getByRole("button", { name: "Continuar", exact: true });
  await expect(proceed).toBeDisabled();
  await page.getByRole("radio", { name: /Advogado\(a\) autônomo\(a\)/ }).check();
  await page.getByLabel("Número da OAB").fill("123456");
  await proceed.click();
  await expect(page.getByText("Informe a UF correspondente à inscrição OAB.")).toBeVisible();
  await page.getByLabel("UF da OAB").selectOption("MG");
  await page.getByRole("checkbox", { name: "Trabalhista", exact: true }).check();
  await proceed.click();

  // Etapa 2 — Diagnóstico respondido (não pulado)
  await expect(page.getByRole("heading", { name: "Um diagnóstico rápido", exact: true })).toBeVisible();
  await page.getByRole("group", { name: /Tamanho da equipe/ }).getByRole("radio", { name: "2 a 5 pessoas", exact: true }).check();
  await page.getByRole("group", { name: /Clientes na carteira/ }).getByRole("radio", { name: "101 a 500", exact: true }).check();
  await page.getByLabel("Ferramenta usada anteriormente (opcional)").fill("Planilhas");
  await page.getByRole("checkbox", { name: "Organizar processos e prazos", exact: true }).check();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();

  // Etapa 3 — Escritório
  await expect(page.getByRole("heading", { name: "Configure seu escritório", exact: true })).toBeVisible();
  const create = page.getByRole("button", { name: "Criar escritório e começar", exact: true });
  await expect(create).toBeDisabled();

  // Retomada: recarregar a página volta para a etapa 3 com as respostas anteriores preservadas
  await page.reload();
  await expect(page.getByRole("heading", { name: "Configure seu escritório", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await expect(page.getByRole("group", { name: /Tamanho da equipe/ }).getByRole("radio", { name: "2 a 5 pessoas", exact: true })).toBeChecked();
  await expect(page.getByRole("group", { name: /Clientes na carteira/ }).getByRole("radio", { name: "101 a 500", exact: true })).toBeChecked();
  await expect(page.getByLabel("Ferramenta usada anteriormente (opcional)")).toHaveValue("Planilhas");
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await expect(page.getByRole("radio", { name: /Advogado\(a\) autônomo\(a\)/ })).toBeChecked();
  await expect(page.getByLabel("Número da OAB")).toHaveValue("123456");
  await expect(page.getByLabel("UF da OAB")).toHaveValue("MG");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Um diagnóstico rápido", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Configure seu escritório", exact: true })).toBeVisible();

  // Código-presente inexistente é recusado pelo servidor; a contratação paga fica bloqueada fora do sandbox
  await page.getByRole("button", { name: "Tenho um código-presente" }).click();
  await page.getByLabel("Código", { exact: true }).fill("LOS-0000-0000-0000-0000");
  await page.getByRole("button", { name: "Ver benefício", exact: true }).click();
  await expect(page.getByText("Código inválido ou indisponível.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reservar benefício" })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /Escolher assinatura/ })).toBeDisabled();
  await expect(page.getByText("Checkout em sandbox ainda não está disponível nesta instalação.")).toBeVisible();
  await expect(page.getByRole("radio", { name: /Avaliação gratuita/ })).toBeChecked();
  await expect(page.getByText(/Não há cobrança automática ao fim do período/)).toBeVisible();

  // Confirmação de e-mail e volta ao assistente, que retoma na etapa 3
  await confirmEmailOfCurrentUser(page);
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "Configure seu escritório", exact: true })).toBeVisible();
  await expect(page.getByText(/Confirme seu e-mail pelo link enviado/)).toHaveCount(0);
  await page.getByLabel("Nome do escritório", { exact: true }).fill(officeName);
  await page.getByLabel("Cidade (opcional)").fill("Belo Horizonte");
  await create.click();
  await expect(page).toHaveURL(/\/dashboard(?:\?|$)/);
  await expect(page.getByTestId("welcome-activation-checklist")).toBeVisible();
  await expect(page.getByRole("link", { name: "Convide alguém da equipe" })).toBeVisible();

  // Concluído, o onboarding não reabre o assistente nem cria outro escritório
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "Novo escritório" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Como você trabalha?" })).toHaveCount(0);

  const c = new Client({ connectionString: DB });
  await c.connect();
  try {
    const { rows } = await c.query(
      `SELECT o.id, o.name, s.status, s.provider_subscription_id, s.billing_provider, p.key AS plan_key, w.completed_at, w.data
         FROM users u
         JOIN memberships m ON m.user_id = u.id
         JOIN organizations o ON o.id = m.organization_id
         JOIN subscriptions s ON s.organization_id = o.id
         JOIN plans p ON p.id = s.plan_id
         JOIN welcome_onboarding w ON w.user_id = u.id AND w.completed_organization_id = o.id
        WHERE u.email = $1`,
      [email],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: officeName, status: "TRIALING", provider_subscription_id: null, billing_provider: null, plan_key: "welcome-trial" });
    expect(rows[0].completed_at).not.toBeNull();
    expect(rows[0].data).toMatchObject({ activationPath: "TRIAL", profile: { professionalType: "SOLO", teamSize: "2_5", previousTool: "Planilhas", oabNumber: "123456", oabUf: "MG", city: "Belo Horizonte" } });
    const identity = await c.query("SELECT oab_number, oab_uf FROM professional_identities WHERE organization_id = $1", [rows[0].id]);
    expect(identity.rows).toEqual([{ oab_number: "123456", oab_uf: "MG" }]);
    expect((await c.query("SELECT count(*)::int AS n FROM billing_invoices WHERE organization_id = $1", [rows[0].id])).rows[0].n).toBe(0);
  } finally {
    await c.end();
  }

  // A página de plano não permite contratar fora do sandbox
  await page.goto("/configuracoes/plano?checkout=simples");
  await expect(page.getByText(/Nenhuma contratação ou cobrança foi iniciada/)).toBeVisible();
  await expect(page.getByTestId("contract-simples")).toHaveCount(0);
});
