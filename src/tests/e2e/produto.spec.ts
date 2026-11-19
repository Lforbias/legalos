import { expect, test } from "@playwright/test";

test("site /produto: página inicial repaginada com os departamentos atuais, nos dois temas e no celular", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /Cada área do escritório/ })).toBeVisible();
  await page.goto("/produto");
  await expect(page).toHaveURL(/\/produto$/);
  await expect(page.getByRole("heading", { level: 1, name: /Cada área do escritório/ })).toBeVisible();

  // caminhos para entrar e criar conta (o servidor de testes tem o cadastro aberto)
  await expect(page.getByTestId("site-entrar")).toHaveAttribute("href", "/login");
  await expect(page.getByTestId("site-criar-conta")).toHaveAttribute("href", "/register");
  await expect(page.getByTestId("home-criar-conta")).toHaveAttribute("href", "/register");

  // mapa: as seis áreas do menu Evolution e o Cowork
  const map = page.getByTestId("home-mapa");
  for (const name of ["Minha Mesa", "Jurídico", "Atendimento", "Comercial", "Financeiro & Contábil", "Administração & Gestão", "Cowork"]) {
    await expect(map.getByText(name, { exact: true })).toBeVisible();
  }
  for (const slug of ["mesa", "juridico", "atendimento", "comercial", "financeiro", "administracao"]) await expect(page.getByTestId(`home-area-${slug}`)).toHaveCount(1);
  await expect(page.getByTestId("home-cowork")).toContainText("LegalOS Cowork");
  await expect(page.getByTestId("home-rute")).toContainText("uma pessoa aprova");
  await expect(page.getByText("A RUTE e as automações nascem desligadas")).toBeVisible();

  // nada da versão antiga
  await expect(page.getByText(/LegalOS Func|LegalOS Box|Func e Chat/)).toHaveCount(0);

  // a tela do produto é real e carrega
  const shot = page.getByRole("img", { name: /Lobby do LegalOS/ });
  await expect.poll(() => shot.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);

  // aplicativo (PWA): só o que existe; os avisos no celular são opcionais e sem dados de cliente
  const pwa = page.getByTestId("produto-pwa");
  await expect(pwa).toContainText("No celular, como aplicativo");
  await expect(pwa).toContainText("Avisos de vencimento no celular");
  await expect(pwa).toContainText("nunca nome de cliente");

  // âncoras do menu
  await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Departamentos" }).click();
  await expect(page).toHaveURL(/#departamentos$/);

  // o tema salvo é aplicado antes da pintura (o script de tema é liberado pela CSP)
  await page.evaluate(() => localStorage.setItem("lo-theme", "light"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.evaluate(() => localStorage.setItem("lo-theme", "dark"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.locator("summary[aria-label=\"Abrir navegação\"]").click();
  await expect(page.getByRole("navigation", { name: "Navegação móvel" }).getByRole("link", { name: "Acessar o sistema" })).toHaveAttribute("href", "/login");
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
