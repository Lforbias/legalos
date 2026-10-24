import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { encryptSecret } from "../../lib/security/totp";

test("RUTE permite revisar, executar e consultar o resultado sem sair da conversa", async ({ page }) => {
  const id = Math.random().toString(36).slice(2, 9);
  const email = `rute-op-${id}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Pessoa operações ${id}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("SenhaForte123");
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await page.getByLabel("Nome do escritório").fill(`Escritório operações ${id}`);
  await page.getByRole("button", { name: "Criar escritório", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://legalos:legalos_dev@localhost:5432/legalos_test";
  if (!/test/i.test(new URL(url).pathname)) throw Error("Fixture exige banco de testes");
  const database = new Client({ connectionString: url }); await database.connect();
  const conversation = randomUUID(), proposal = randomUUID();
  try {
    const { rows: [person] } = await database.query('SELECT u.id AS user_id, m.organization_id FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.email=$1', [email]);
    await database.query('UPDATE organizations SET ai_enabled=true WHERE id=$1', [person.organization_id]);
    await database.query('INSERT INTO rute_settings (id, organization_id, assistant_enabled, proposals_enabled, provider, api_key_enc) VALUES ($1,$2,true,true,$3,$4)', [randomUUID(), person.organization_id, "GEMINI", encryptSecret("chave-ficticia-somente-fixture-123456789", Buffer.alloc(32,5))]);
    await database.query('INSERT INTO assistant_conversations (id, organization_id, user_id, title) VALUES ($1,$2,$3,$4)', [conversation, person.organization_id, person.user_id, "Criar cliente pelo chat"]);
    await database.query('INSERT INTO ai_proposals (id, organization_id, user_id, via, connection, kind, title, payload, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now()+interval \'7 days\')', [proposal, person.organization_id, person.user_id, "ASSISTANT", conversation, "CLIENT_CREATE", "Novo cliente pelo chat", JSON.stringify({ name: "Cliente criado pela conversa", type: "PERSON", status: "ACTIVE", notes: "", tags: "", addressCity: "", addressState: "" })]);
    await database.query('INSERT INTO assistant_messages (id, organization_id, conversation_id, role, content, refs) VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), person.organization_id, conversation, "assistant", "Preparei a proposta. Confira os dados e confirme aqui.", JSON.stringify([{ type: "proposal", id: proposal, title: "Novo cliente pelo chat" }])]);
    await page.reload();
    await page.getByRole("button", { name: "Abrir RUTE", exact: true }).click();
    await page.getByRole("combobox", { name: "Conversas da RUTE", exact: true }).selectOption(conversation);
    const card = page.getByRole("region", { name: "Proposta da RUTE", exact: true });
    await expect(card.getByRole("textbox", { name: "Nome", exact: true })).toHaveValue("Cliente criado pela conversa");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "/tmp/legalos-rute-acao-mobile.png", fullPage: true });
    await card.getByRole("button", { name: "Aprovar e executar", exact: true }).click();
    await expect(card.getByText("Ação executada.", { exact: false })).toBeVisible();
    await expect(card.getByRole("button", { name: "Aprovar e executar" })).toHaveCount(0);
    const { rows: clients } = await database.query('SELECT id FROM clients WHERE organization_id=$1 AND name=$2', [person.organization_id, "Cliente criado pela conversa"]);
    expect(clients).toHaveLength(1);
    await expect(card.getByRole("link", { name: "Abrir resultado", exact: true })).toHaveAttribute("href", `/clientes/${clients[0].id}`);
    await expect(page).toHaveURL(/\/$/);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: "/tmp/legalos-rute-acao-executada.png", fullPage: true });
  } finally { await database.end(); }
});
