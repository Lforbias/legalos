import { expect, test, type Page } from "@playwright/test";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);

async function register(page: Page, name: string, email: string) {
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(name);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
}

test("cadastro → escritório → dashboard com dados reais → convite → aceite → isolamento", async ({ page, browser }) => {
  const id = uid();
  const ownerEmail = `dona-${id}@example.test`;
  const guestEmail = `convidado-${id}@example.test`;

  // visitante na raiz vê a página pública (sem dados do sistema) e entra pelo botão; rota protegida vai ao login
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: /Advocacia com atenção/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Áreas de atuação" })).toBeVisible();
  await expect(page.getByText(/não constituem consulta jurídica/)).toBeVisible();
  await page.goto("/clientes");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/");
  await page.getByTestId("landing-login").click();
  await expect(page).toHaveURL(/\/login/);

  // cadastro
  await register(page, "Talita Teste", ownerEmail);
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Nome do escritório").fill(`Escritório ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();

  // dashboard conectado ao banco
  await expect(page.getByRole("heading", { name: /Bom dia, Talita/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "O que precisa da sua atenção" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Financeiro do escritório" })).toBeVisible();
  // todos os módulos do menu estão implementados: Relatórios abre a tela real
  await page.getByRole("button", { name: "Gestão do escritório", exact: true }).click();
  await page.getByRole("link", { name: /Relatórios e BI/ }).first().click();
  await expect(page.getByRole("heading", { name: "Relatórios e BI" })).toBeVisible();

  // validação no cliente: convite sem e-mail
  await page.goto("/configuracoes/equipe");
  await page.getByRole("button", { name: "Convidar usuário" }).click();
  await page.getByRole("button", { name: "Gerar convite" }).click();
  await expect(page.getByText("Informe o e-mail.")).toBeVisible();

  // convite real
  await page.getByLabel("E-mail", { exact: true }).fill(guestEmail);
  await page.getByLabel("Perfil", { exact: true }).selectOption({ label: "Advogado" });
  await page.getByRole("button", { name: "Gerar convite" }).click();
  await expect(page.getByText("envio de e-mail não está configurado")).toBeVisible();
  const link = (await page.locator("code").first().innerText()).trim();
  expect(link).toContain("/accept-invite?token=");

  // convidado cria conta pelo link e entra direto no escritório
  const guestCtx = await browser.newContext({ baseURL: page.url().split("/configuracoes")[0] });
  const guest = await guestCtx.newPage();
  await guest.goto(link);
  await expect(guest.getByRole("heading", { name: /Convite para/ })).toBeVisible();
  await guest.getByRole("link", { name: "Criar conta para aceitar" }).click();
  await expect(guest.getByLabel("E-mail")).toHaveValue(guestEmail);
  await guest.getByLabel("Nome completo").fill("Advogado Convidado");
  await guest.getByLabel("Senha", { exact: true }).fill(password);
  await guest.getByRole("button", { name: "Criar conta" }).click();
  await expect(guest.getByRole("heading", { name: /Bom dia, Advogado/ })).toBeVisible();

  // permissões: advogado não vê auditoria nem gestão de equipe
  await guest.goto("/configuracoes/auditoria");
  await expect(guest.getByText("Acesso negado")).toBeVisible();
  await guest.goto("/configuracoes/equipe");
  await expect(guest.getByRole("button", { name: "Convidar usuário" })).toHaveCount(0);

  // link de convite não pode ser reutilizado
  await guest.goto(link);
  await expect(guest.getByText(/inválido, expirado ou já utilizado/)).toBeVisible();

  // proprietária vê o novo membro e a trilha de auditoria
  await page.goto("/configuracoes/equipe");
  await expect(page.getByText("Advogado Convidado")).toBeVisible();
  await page.goto("/configuracoes/auditoria");
  await expect(page.getByText("invitation.accept")).toBeVisible();

  // logout invalida a sessão
  await guestCtx.close();
  await page.getByRole("button", { name: "Menu do usuário" }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/configuracoes/equipe");
  await expect(page).toHaveURL(/\/login/);
});

test("login com senha incorreta mostra erro genérico", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("ninguem@example.test");
  await page.getByLabel("Senha").fill("qualquer-senha1");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("E-mail ou senha inválidos.")).toBeVisible();
});

test("escritórios são isolados: um usuário não enxerga a equipe de outro escritório", async ({ browser }) => {
  const id = uid();
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  for (const [p, label] of [[a, "A"], [b, "B"]] as const) {
    await register(p, `Dono ${label}${id}`, `dono-${label.toLowerCase()}-${id}@example.test`);
    await p.getByLabel("Nome do escritório").fill(`Banca ${label} ${id}`);
    await p.getByRole("button", { name: "Criar escritório" }).click();
    await expect(p.getByRole("heading", { name: /Bom dia/ })).toBeVisible();
  }
  await a.goto("/configuracoes/equipe");
  await expect(a.getByText(`Dono A${id}`)).toBeVisible();
  await expect(a.getByText(`Dono B${id}`)).toHaveCount(0);
  // a busca global também respeita o escritório
  await a.getByLabel("Busca global").fill(`Dono B${id}`);
  await expect(a.getByText("Nada encontrado")).toBeVisible();
  await ctxA.close();
  await ctxB.close();
});
