import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Client } from "pg";

test("workspace connects client folders to multiple cases and original records", async ({ page }) => {
  const unique = randomUUID().slice(0, 8);
  const email = `desktop-${unique}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill("Pessoa Desktop");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("SenhaForte123");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await page.getByLabel("Nome do escritório").fill(`Desktop de demonstração ${unique}`);
  await page.getByRole("button", { name: "Criar escritório", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Bom dia|Boa tarde|Boa noite/ })).toBeVisible();
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://legalos:legalos_dev@localhost:5432/legalos_test";
  if (!/test/i.test(new URL(url).pathname)) throw Error("Fixture requires test database");
  const database = new Client({ connectionString: url }); await database.connect();
  try {
    const { rows: [person] } = await database.query('SELECT m.organization_id FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.email=$1', [email]);
    const org = person.organization_id;
    const clientId = randomUUID();
    const first = randomUUID(), second = randomUUID();
    for (const [i, name] of ["Ana Carolina Martins", "Bruno Henrique Almeida", "Camila Fernanda Ribeiro", "Diego Augusto Santos", "Mariana Beatriz Costa"].entries()) await database.query('INSERT INTO clients (id, organization_id, type, name, notes, tags) VALUES ($1,$2,\'PERSON\',$3,$4,$5)', [i ? randomUUID() : clientId, org, name, "Dados fictícios para demonstração da Área de Trabalho. Atendimento em análise; documentos a conferir.", ["Teste", i ? "Atendimento inicial" : "Trabalhista"]]);
    for (const [id, title] of [[first, "Revisão das verbas rescisórias"], [second, "Consulta sobre contrato de serviços"]]) {
      await database.query('INSERT INTO cases (id, organization_id, title, updated_at) VALUES ($1,$2,$3,now())', [id, org, title]);
      await database.query('INSERT INTO case_parties (id, organization_id, case_id, client_id, name, role, is_our_client) VALUES ($1,$2,$3,$4,$5,\'PLAINTIFF\',true)', [randomUUID(), org, id, clientId, "Ana Carolina Martins"]);
    }
    await database.query('INSERT INTO tasks (id, organization_id, title, case_id, updated_at) VALUES ($1,$2,$3,$4,now())', [randomUUID(), org, "Conferir documentos da rescisão", first]);
    await page.getByRole("link", { name: "Abrir LegalOS Desktop", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Qual cliente vamos abrir?", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navegação Func", exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Ana Carolina Martins", exact: true })).toHaveCount(0);
    await page.screenshot({ path: "/tmp/legalos-desktop-entrada.png", fullPage: true, animations: "disabled" });
    await page.getByRole("textbox", { name: "Nome, CPF ou processo", exact: true }).fill("a");
    await page.getByRole("button", { name: "Buscar cliente", exact: true }).click();
    await expect(page.getByText("5 pasta(s) encontrada(s)", { exact: true })).toBeVisible();
    await page.screenshot({ path: "/tmp/legalos-desktop-pastas.png", fullPage: true, animations: "disabled" });
    await page.getByRole("link").filter({ has: page.getByRole("heading", { name: "Ana Carolina Martins", exact: true }) }).click();
    await expect(page.getByRole("heading", { name: "Ana Carolina Martins", exact: true })).toBeVisible();
    await expect(page.getByText("Conferir documentos da rescisão", { exact: true })).toBeVisible();
    await page.screenshot({ path: "/tmp/legalos-desktop-pasta.png", fullPage: true, animations: "disabled" });
    await page.getByRole("link", { name: /Casos e processos/ }).first().click();
    await expect(page.getByRole("heading", { name: "Revisão das verbas rescisórias", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Consulta sobre contrato de serviços", exact: true })).toBeVisible();
    await expect(page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Revisão das verbas rescisórias", exact: true }) }).getByRole("link", { name: "Abrir caso →", exact: true })).toHaveAttribute("href", `/processos/${first}`);
    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 960 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    }
    await page.goto("/area-de-trabalho");
    await page.getByRole("textbox", { name: "Nome, CPF ou processo", exact: true }).fill("Bruno");
    await page.getByRole("button", { name: "Buscar cliente", exact: true }).click();
    await expect(page.getByText("1 pasta(s) encontrada(s)", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ana Carolina Martins", exact: true })).toHaveCount(0);
  } finally { await database.end(); }
});
