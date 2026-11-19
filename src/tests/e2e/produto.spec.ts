import { expect, test } from "@playwright/test";

test("site /produto: landing de lançamento com contagem, departamentos, formulário de interesse e celular", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "O sistema operacional do escritório de advocacia" })).toBeVisible();
  await page.goto("/produto");
  await expect(page).toHaveURL(/\/produto$/);
  await expect(page.getByText(/Lançamento em 05\.01\.2027/)).toBeVisible();
  await expect(page.getByTestId("launch-countdown")).toHaveAttribute("aria-label", /Faltam \d+ dias para o lançamento/);

  // caminhos para entrar e criar conta (o servidor de testes tem o cadastro aberto)
  await expect(page.getByTestId("site-entrar")).toHaveAttribute("href", "/login");
  await expect(page.getByTestId("site-criar-conta")).toHaveAttribute("href", "/register");
  // sem WhatsApp configurado, o botão não aparece (nada inventado)
  await expect(page.getByTestId("cta-whatsapp")).toHaveCount(0);

  for (const slug of ["mesa", "juridico", "atendimento", "comercial", "financeiro", "administracao"]) await expect(page.getByTestId(`home-area-${slug}`)).toHaveCount(1);
  await expect(page.getByTestId("home-rute")).toContainText("Uma pessoa decide");
  await expect(page.getByText(/LegalOS Func|LegalOS Box|Func e Chat/)).toHaveCount(0);
  const shot = page.getByRole("img", { name: /Lobby do LegalOS/ });
  await shot.scrollIntoViewIfNeeded();
  await expect.poll(() => shot.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);

  // formulário de interesse: valida, grava e confirma
  await page.getByTestId("cta-interesse").click();
  await expect(page).toHaveURL(/#interesse$/);
  const submit = page.getByRole("button", { name: /Registrar interesse/ });
  await submit.click();
  await expect(page.getByText("Informe o seu nome.")).toBeVisible();
  await expect(page.getByText("É preciso autorizar o contato para registrar o interesse.")).toBeVisible();
  const email = `evento-${crypto.randomUUID().slice(0, 8)}@example.test`;
  await page.getByLabel("Nome", { exact: true }).fill("Pessoa do Evento");
  await page.getByLabel("Escritório", { exact: true }).fill("Escritório do Evento");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("WhatsApp (com DDD)").fill("(11) 98888-7777");
  await page.getByLabel(/Autorizo o LegalOS/).check();
  await submit.click();
  await expect(page.getByTestId("interest-done")).toContainText("Interesse registrado");

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const [path, h1] of [["/produto/recursos", /Tudo o que o escritório/], ["/produto/roadmap", /Tudo o que temos/], ["/produto/seguranca", /Privado/], ["/produto/sobre", /Feito por quem/], ["/produto/contato", /Vamos/]] as const) {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(h1);
  }
});

test("LegalOS Desktop tem apresentação pública própria e diferencia entrega de evolução", async ({ page }) => {
  const response = await page.goto("/produto/desktop");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("LegalOS Desktop — sua área de trabalho por cliente");
  await expect(page.getByRole("link", { name: "Abrir LegalOS Desktop", exact: true })).toHaveAttribute("href", "/area-de-trabalho");
  await expect(page.getByText(/a análise conectada a notebooks são ideias para evolução/)).toBeVisible();
  const preview = page.getByRole("img", { name: /busca e pastas de clientes fictícios/ });
  await preview.scrollIntoViewIfNeeded();
  await expect.poll(() => preview.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
    await expect(page.getByTestId("produto-desktop").getByRole("img", { name: "LegalOS Desktop", exact: true }).filter({ visible: true })).toHaveAttribute("src", "/brand/legalos-desktop-dark.svg");
  }
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "/tmp/legalos-desktop-produto.png", fullPage: true, animations: "disabled" });
});

test("site /produto: sem contato configurado não inventa telefone nem e-mail e o botão leva ao login", async ({ page }) => {
  await page.goto("/produto/contato");
  await expect(page.getByRole("heading", { name: "Contato em breve" })).toBeVisible();
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  await expect(page.locator('a[href^="https://wa.me"]')).toHaveCount(0);
  await page.getByRole("link", { name: "Entrar no sistema", exact: true }).first().click();
  await expect(page).toHaveURL(/\/login/);
});

test("site /produto: a página da equipe do escritório (/inicio) e a raiz continuam funcionando", async ({ page }) => {
  const res = await page.goto("/inicio");
  expect(res?.status()).toBe(200);
  await expect(page.getByTestId("landing-login")).toBeVisible();
});
