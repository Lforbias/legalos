import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Client } from "pg";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);
const url = process.env.TEST_DATABASE_URL ?? "postgresql://legalos:legalos_dev@localhost:5432/legalos_test";

/** Insere uma publicação capturada DIRETO no banco, como faria outro processo (a rotina agendada): sem aviso em memória. */
async function insertCaptured(db: Client, org: string, title: string, officialId: string) {
  const id = randomUUID();
  await db.query(
    `INSERT INTO court_notices (id, organization_id, source, status, kind, title, content, received_at, content_hash, external_key, origin_kind, source_system, official_id, court_code, captured_at, official_ack_state, case_match_state, updated_at)
     VALUES ($1,$2,'IMPORTED','NEW','INTIMACAO',$3,$4,CURRENT_DATE,$5,$6,'DJEN_PUBLICATION','djen',$7,'TJBA',now(),'NOT_APPLICABLE','NO_CNJ',now())`,
    [id, org, title, `Teor sintético ${title} para o teste de atualização ao vivo.`, `hash-${id}`, `djen:${officialId}`, officialId],
  );
  await db.query(`INSERT INTO notice_events (id, organization_id, notice_id, kind, data) VALUES ($1,$2,$3,'CAPTURED',$4)`, [randomUUID(), org, id, JSON.stringify({ origin: "DJEN_PUBLICATION", source: "djen", officialId })]);
  return id;
}

test("Box 2.0 — Caixa de Entrada: atualização ao vivo (≤10 s), vista no LegalOS sem ciência oficial e seleção protegida", async ({ page, browser }) => {
  test.setTimeout(150_000);
  if (!/test/i.test(new URL(url).pathname)) throw Error("Fixture requires test database");
  const id = uid();
  const email = `dona-inb-${id}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona inbox ${id}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca inbox ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    const { rows: [m] } = await db.query("SELECT m.organization_id FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.email=$1", [email]);
    const org: string = m.organization_id;
    const t1 = `Intimação A ${id}`;
    const t2 = `Intimação B ${id}`;
    const t3 = `Intimação C ${id}`;
    await insertCaptured(db, org, t1, `E2E-${id}-1`);

    // a rota de eventos exige sessão: sem cookie não é um canal de eventos
    const anon = await browser.newContext({ baseURL: `http://localhost:3102` });
    const denied = await anon.request.get("/api/box/events", { maxRedirects: 0 });
    expect(denied.headers()["content-type"] ?? "").not.toContain("text/event-stream");
    expect(denied.status()).not.toBe(200);
    await anon.close();

    await page.goto("/caixa-de-entrada");
    await expect(page.getByTestId("live-status")).toHaveAttribute("data-live-state", "live", { timeout: 10_000 });
    const row1 = page.locator("tr", { hasText: t1 });
    await expect(row1).toBeVisible();
    await expect(row1).toContainText("Publicação no DJEN");
    await expect(row1).toContainText("Não vista no LegalOS");
    await expect(row1).toContainText("Sem ciência oficial a registrar");
    await expect(page.getByTestId("day-unviewed")).toHaveText("1");
    await page.screenshot({ path: "/tmp/legalos-box-v2-inbox-1-lista.png", fullPage: true });

    // 1) chega uma comunicação nova SEM recarregar a página: ≤ 10 s
    await page.evaluate(() => { (window as unknown as { __noReload: number }).__noReload = 1; });
    const started = Date.now();
    await insertCaptured(db, org, t2, `E2E-${id}-2`);
    await expect(page.getByText(t2)).toBeVisible({ timeout: 10_000 });
    const elapsed = Date.now() - started;
    console.log(`[box-v2-inbox] comunicação nova apareceu em ${elapsed} ms (sem recarregar a página)`);
    expect(elapsed).toBeLessThanOrEqual(10_000);
    expect(await page.evaluate(() => (window as unknown as { __noReload?: number }).__noReload)).toBe(1);
    await expect(page.getByTestId("day-unviewed")).toHaveText("2");

    // 2) abrir no LegalOS marca "vista" — e NÃO registra ciência oficial
    await page.getByRole("link", { name: t1 }).click();
    await expect(page.getByTestId("notice-states")).toBeVisible();
    await page.waitForTimeout(1500); // a marcação roda no navegador, depois de abrir
    await page.reload();
    const states = page.getByTestId("notice-states");
    await expect(states.locator("[data-state-key='viewed']")).toContainText("Vista no LegalOS");
    await expect(states.locator("[data-state-key='official']")).toContainText("Sem ciência oficial a registrar");
    await expect(states).not.toContainText("Ciência oficial registrada");
    const timeline = page.getByTestId("notice-timeline");
    await expect(timeline).toContainText("Capturada pelo LegalOS");
    await expect(timeline).toContainText("Vista no LegalOS por");
    await expect(timeline).toContainText("Abrir aqui não registra ciência no tribunal");
    await page.screenshot({ path: "/tmp/legalos-box-v2-inbox-2-detalhe.png", fullPage: true });
    const { rows: [after] } = await db.query("SELECT first_viewed_at, official_ack_at, official_ack_state FROM court_notices WHERE title=$1 AND organization_id=$2", [t1, org]);
    expect(after.first_viewed_at).not.toBeNull();
    expect(after.official_ack_at).toBeNull();
    expect(after.official_ack_state).toBe("NOT_APPLICABLE");

    // 3) a lista reflete a vista e o filtro "ainda não vistas" separa as duas
    await page.goto("/caixa-de-entrada?vista=nao");
    await expect(page.getByText(t2)).toBeVisible();
    await expect(page.getByText(t1)).toHaveCount(0);
    await page.goto("/caixa-de-entrada?vista=sim");
    await expect(page.getByText(t1)).toBeVisible();
    await expect(page.getByText(t2)).toHaveCount(0);
    await page.goto("/caixa-de-entrada");
    await expect(page.getByTestId("day-unviewed")).toHaveText("1");

    // 4) seleção em lote em andamento NÃO é derrubada pela atualização: aparece um aviso
    await expect(page.getByTestId("live-status")).toHaveAttribute("data-live-state", "live", { timeout: 10_000 });
    await page.getByRole("checkbox", { name: `Selecionar ${t2}` }).check();
    await insertCaptured(db, org, t3, `E2E-${id}-3`);
    await expect(page.getByTestId("live-waiting")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(t3)).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: `Selecionar ${t2}` })).toBeChecked();
    await page.screenshot({ path: "/tmp/legalos-box-v2-inbox-3-aviso.png", fullPage: true });
    await page.getByRole("button", { name: "Atualizar agora" }).click();
    await expect(page.getByText(t3)).toBeVisible({ timeout: 10_000 });

    // 5) a Visão Geral também acompanha
    await page.goto("/box");
    await expect(page.getByTestId("live-status")).toHaveAttribute("data-live-state", "live", { timeout: 10_000 });
    await expect(page.getByTestId("latest-communications")).toContainText(t3);
    const t4 = `Intimação D ${id}`;
    await insertCaptured(db, org, t4, `E2E-${id}-4`);
    await expect(page.getByTestId("latest-communications")).toContainText(t4, { timeout: 10_000 });
  } finally {
    await db.end();
  }
});
