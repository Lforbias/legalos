import { expect, test } from "@playwright/test";

test("site /produto: páginas públicas abrem sem login, imagens carregam e as abas de módulos funcionam", async ({ page }) => {
  await page.goto("/produto");
  await expect(page).toHaveURL(/\/produto$/);
  await expect(page.getByRole("heading", { level: 1, name: /O escritório inteiro/ })).toBeVisible();
  await expect(page.getByText("Telas reais do sistema, com dados de demonstração fictícios.")).toBeVisible();

  // futuro: deixa claro que ainda não existe
  const ai = page.getByTestId("future-ai");
  await expect(ai).toContainText("RUTE");
  await expect(ai).toContainText("Em planejamento");
  await expect(ai).toContainText("Ainda não está disponível");

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

  for (const [path, h1] of [["/produto/recursos", /Tudo o que o escritório/], ["/produto/seguranca", /Privado/], ["/produto/sobre", /Feito por quem/], ["/produto/contato", /Vamos/]] as const) {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(h1);
  }
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
