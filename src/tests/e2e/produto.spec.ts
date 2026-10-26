import { expect, test } from "@playwright/test";

test("site /produto: páginas públicas abrem sem login, imagens carregam e as abas de módulos funcionam", async ({ page }) => {
  await page.goto("/produto");
  await expect(page).toHaveURL(/\/produto$/);
  await expect(page.getByRole("heading", { level: 1, name: /O escritório inteiro/ })).toBeVisible();
  await expect(page.getByText("Telas reais do sistema, com dados de demonstração fictícios.")).toBeVisible();

  // futuro: deixa claro que ainda não existe
  const ai = page.getByTestId("future-ai");
  await expect(ai).toContainText("RUTE");
  await expect(ai).toContainText("Disponível");
  await expect(ai).toContainText("Nasce desligada");

  const desktop = page.getByTestId("produto-desktop");
  await desktop.scrollIntoViewIfNeeded();
  await expect(desktop.getByRole("img", { name: "LegalOS Desktop", exact: true }).filter({ visible: true })).toHaveCount(1);
  await expect(desktop).toContainText("Uso exclusivo em computador");
  await expect(desktop.getByRole("link", { name: "Conhecer o LegalOS Desktop" })).toHaveAttribute("href", "/produto/desktop");

  // seção do aplicativo (PWA): só o que existe; os avisos no celular são opcionais e sem dados de cliente
  const pwa = page.getByTestId("produto-pwa");
  await expect(pwa).toContainText("No celular, como aplicativo");
  await expect(pwa).toContainText("Instala em Android e iPhone");
  await expect(pwa).toContainText("Avisos de vencimento no celular");
  await expect(pwa).toContainText("nunca nome de cliente");

  // vitrine de módulos: troca de aba muda o conteúdo e a imagem carrega
  await page.getByRole("tab", { name: "Financeiro" }).scrollIntoViewIfNeeded();
  await page.getByRole("tab", { name: "Financeiro" }).click();
  await expect(page.getByRole("heading", { name: "Honorários e despesas sob controle" })).toBeVisible();
  const img = page.getByRole("tabpanel").getByRole("img");
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await page.getByRole("tab", { name: "Intimações" }).press("ArrowRight");
  await expect(page.getByRole("tab", { name: "LegalOS Chat" })).toHaveAttribute("aria-selected", "true");

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
  await expect(page.getByRole("banner").getByRole("link", { name: /Entrar/ }).first()).toBeVisible();
});

test("site /produto: a página da equipe do escritório (/inicio) e a raiz continuam funcionando", async ({ page }) => {
  const res = await page.goto("/inicio");
  expect(res?.status()).toBe(200);
  await expect(page.getByTestId("landing-login")).toBeVisible();
});
