import { expect, test } from "@playwright/test";
import { Client } from "pg";

test("Evolution: seis departamentos, navegação, Desktop e permissões", async ({ page }, testInfo) => {
  const id = crypto.randomUUID().slice(0, 8);
  const email = `evolution-${id}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill("Pessoa Evolution");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("SenhaForte123");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await page.getByLabel("Nome do escritório").fill(`Escritório Evolution ${id}`);
  await page.getByRole("button", { name: "Criar escritório", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Bom dia/ })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 900 });
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page.getByRole("dialog", { name: "Menu", exact: true }).getByRole("link", { name: "Lobby", exact: true }).click();
  await expect(page).toHaveURL(/\/evolution$/);

  const departments = [
    ["juridico", "Jurídico", "/processos"],
    ["controladoria", "Controladoria", "/alertas"],
    ["atendimento", "Atendimento", "/atendimento"],
    ["comercial", "Comercial", "/crm"],
    ["financeiro", "Financeiro & Contábil", "/financeiro"],
    ["administracao", "Administração & Gestão", "/integracoes"],
  ];

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [slug, title, target] of departments) {
      const response = await page.goto(`/evolution/${slug}`);
      expect(response?.status()).toBe(200);
      const main = page.getByRole("main");
      await expect(main.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
      await expect(main.locator(`a[href="${target}"]`).first()).toBeVisible();
      await expect(main.getByText(/Não foi possível carregar/)).toHaveCount(0);
      expect(await main.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      const header = page.getByRole("banner");
      expect(await header.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${slug}-${width}.png`) });
      await main.locator(`a[href="${target}"]`).first().click();
      await expect(page).toHaveURL(url => url.pathname === target);
      await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
      if (width === 390) await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
      await expect(page.locator("[data-space]").first()).toHaveAttribute("data-space", "evolution");
      const menu = page.getByRole("navigation", { name: "Navegação Evolution" });
      await expect(menu).toBeVisible();
      await expect(menu.locator(`a[href="${target}"]`)).toHaveAttribute("aria-current", "page");
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/evolution");
  await expect(page.getByRole("link", { name: "Abrir LegalOS Desktop" })).toHaveAttribute("href", "/area-de-trabalho");
  await page.getByRole("searchbox", { name: "Busca global" }).fill("Processos");
  await expect(page.getByRole("link", { name: "Processos e casos", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Voltar para Ethos" })).toHaveCount(0);
  await page.getByRole("link", { name: "Resumo do escritório" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("navigation", { name: "Navegação Evolution" })).toBeVisible();

  await page.goto("/tarefas/nova");
  await page.getByLabel("Título", { exact: true }).fill(`Conferência Evolution ${id}`);
  await page.getByRole("button", { name: "Criar tarefa", exact: true }).click();
  await expect(page.getByRole("heading", { name: `Conferência Evolution ${id}`, exact: true })).toBeVisible();
  await page.goto(`/evolution/controladoria?q=${id}`);
  const desk = page.getByRole("region", { name: "Mesa de controle operacional" });
  await expect(desk.getByRole("link", { name: `Conferência Evolution ${id}`, exact: true })).toBeVisible();
  await desk.getByRole("link", { name: "Quadro", exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === "/evolution/controladoria" && url.searchParams.get("visao") === "quadro" && url.searchParams.get("q") === id);
  const saved = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === "/evolution/controladoria");
  await desk.getByLabel("Situação da tarefa", { exact: true }).selectOption("IN_PROGRESS");
  await saved;
  await expect(desk.getByLabel("Situação da tarefa", { exact: true })).toBeEnabled();
  await page.reload();
  await expect(desk.getByLabel("Situação da tarefa", { exact: true })).toHaveValue("IN_PROGRESS");
  await desk.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("controladoria-operacao.png") });

  const db = new Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://legalos:legalos_dev@localhost:5432/legalos_test" });
  await db.connect();
  try {
    const changed = await db.query(`
      UPDATE memberships m SET role_id = r.id
      FROM users u, roles r
      WHERE m.user_id = u.id AND u.email = $1 AND r.organization_id = m.organization_id
        AND r.key = 'FINANCE'
    `, [email]);
    expect(changed.rowCount).toBe(1);
    await db.query(`
      UPDATE roles SET permissions = array_remove(permissions, 'clients:read')
      WHERE id IN (
        SELECT m.role_id FROM memberships m JOIN users u ON u.id = m.user_id WHERE u.email = $1
      )
    `, [email]);
  } finally {
    await db.end();
  }
  await page.goto("/evolution");
  await expect(page.getByRole("link", { name: "Abrir LegalOS Desktop" })).toHaveCount(0);
  const nav = page.getByRole("navigation", { name: "Navegação Evolution" });
  await nav.getByRole("button", { name: "Controladoria", exact: true }).click();
  await nav.getByRole("link", { name: "Visão geral", exact: true }).click();
  await expect(page).toHaveURL(/\/evolution\/controladoria$/);
  await expect(page.getByRole("link", { name: "Caixa de entrada", exact: true })).toHaveCount(0);
});
