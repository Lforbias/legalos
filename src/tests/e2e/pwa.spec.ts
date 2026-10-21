import { expect, test } from "@playwright/test";

// Arquivos do app instalável precisam ser públicos (o navegador os busca sem cookie de sessão).
test("manifesto, service worker e tela offline são públicos e bem formados", async ({ request }) => {
  const mf = await request.get("/manifest.webmanifest");
  expect(mf.status()).toBe(200);
  const json = await mf.json();
  expect(json.name).toContain("LegalOS");
  expect(json.display).toBe("standalone");

  const sw = await request.get("/sw.js");
  expect(sw.status()).toBe(200);
  expect(sw.headers()["cache-control"]).toContain("no-cache");
  expect(sw.headers()["content-type"]).toContain("javascript");
  const swText = await sw.text();
  expect(swText).toContain('addEventListener("push"');
  expect(swText).toContain('addEventListener("notificationclick"');

  const off = await request.get("/offline.html");
  expect(off.status()).toBe(200);
  for (const icon of ["/pwa/icon-192.png", "/pwa/icon-512.png", "/pwa/maskable-512.png", "/pwa/apple-touch-icon.png"]) {
    const r = await request.get(icon);
    expect(r.status(), icon).toBe(200);
    expect(r.headers()["content-type"]).toContain("image/png");
  }
});

test("a página de login aponta para o manifesto e a CSP permite o service worker", async ({ page }) => {
  const res = await page.goto("/login");
  const csp = res?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("worker-src 'self'");
  expect(csp).toContain("manifest-src 'self'");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest\.webmanifest/);
});

test("o service worker registra e, sem internet, mostra a tela offline (sem dados)", async ({ page, context }) => {
  await page.goto("/login");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(async () => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 10_000 }).toBe(true);
  await context.setOffline(true);
  await page.goto("/prazos").catch(() => {});
  await expect(page.getByRole("heading", { name: "Sem conexão com a internet" })).toBeVisible();
  await context.setOffline(false);
});
