import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);
const url = process.env.TEST_DATABASE_URL ?? "postgresql://legalos:legalos_dev@localhost:5432/legalos_test";

async function signUpWithOffice(page: Page, label: string) {
  const id = uid();
  const email = `dona-${label}-${id}@example.test`;
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona ${label}${id}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca ${label} ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  return { id, email };
}

/** Cria uma petição aprovada pela tela (documento principal gerado de um modelo) e devolve o id. */
async function approvedPetition(page: Page, id: string, title: string, doc: string) {
  await page.goto("/peticoes/nova");
  await page.getByLabel("Processo").selectOption({ label: `Caso ${id}` });
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByLabel("Título da petição").fill(title);
  await page.getByLabel("Documento", { exact: true }).selectOption({ label: `${doc}.docx (v1)` });
  await page.getByRole("button", { name: "Criar petição" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const petitionId = /\/peticoes\/([0-9a-f-]{36})/.exec(page.url())![1]!;
  await page.getByRole("button", { name: "Enviar para revisão" }).click();
  await page.getByRole("button", { name: "Aprovar" }).click();
  await expect(page.getByRole("button", { name: "Enviar (demonstração)" })).toBeVisible();
  return petitionId;
}

/** Simula o que o servidor grava quando um envio real fica sem resposta (o adaptador real não existe neste ambiente de teste). */
async function makeUnknown(db: Client, petitionId: string) {
  const { rows: [p] } = await db.query("SELECT organization_id FROM petition_filings WHERE id=$1", [petitionId]);
  await db.query(
    `UPDATE petition_filings SET status='UNKNOWN', is_demo=false, adapter='mni', filing_environment='PRODUCTION', attempt_count=1, unknown_since=now(), submitted_by_id=NULL,
       error='ATENÇÃO: não recebemos confirmação do tribunal e a petição PODE ter sido protocolada.' WHERE id=$1`,
    [petitionId],
  );
  await db.query(
    `INSERT INTO petition_attempts (id, organization_id, petition_id, attempt_no, adapter, environment, manifest_sha256, idempotency_key, outcome, error_code, error_message, finished_at)
     VALUES ($1,$2,$3,1,'mni','PRODUCTION',$4,$5,'UNCERTAIN','NO_CONFIRMATION','O tribunal não respondeu.',now())`,
    [randomUUID(), p.organization_id, petitionId, "0".repeat(64), `k-${petitionId}`],
  );
}

test("Peticionamento — estado desconhecido bloqueia reenvio; conferência registra o resultado (recibo ou 'não foi protocolada')", async ({ page }) => {
  test.setTimeout(180_000);
  if (!/test/i.test(new URL(url).pathname)) throw Error("Fixture requires test database");
  const { id } = await signUpWithOffice(page, "pet");
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    await page.goto("/processos/novo");
    await page.getByLabel("Título do caso ou processo").fill(`Caso ${id}`);
    await page.getByRole("button", { name: "Cadastrar caso ou processo" }).click();
    await expect(page.getByRole("heading", { name: `Caso ${id}` })).toBeVisible();

    await page.goto("/documentos/modelos/novo");
    await page.getByLabel("Nome do modelo").fill(`Modelo ${id}`);
    await page.getByLabel("Texto do modelo").fill("# PEÇA\n\nProcesso {{processo.titulo}}.");
    await page.getByRole("button", { name: "Criar modelo" }).click();
    await expect(page.getByRole("link", { name: `Modelo ${id}` })).toBeVisible();
    for (const title of [`Petição A ${id}`, `Petição B ${id}`, `Recibo ${id}`]) {
      await page.goto("/documentos/gerar");
      await page.getByLabel("Modelo").selectOption({ label: `Modelo ${id}` });
      await page.getByLabel("Título do documento").fill(title);
      await page.getByLabel("Processo").selectOption({ label: `Caso ${id}` });
      await page.getByRole("button", { name: "Gerar documento (.docx)" }).click();
      await expect(page.getByRole("heading", { name: `${title}.docx` })).toBeVisible();
    }

    // ---------------------------------------------------------------- A: a conferência diz "não foi protocolada"
    const a = await approvedPetition(page, id, `Contestação A ${id}`, `Petição A ${id}`);
    await makeUnknown(db, a);
    await page.goto(`/peticoes/${a}`);
    await expect(page.getByText("Estado desconhecido — confira no tribunal").first()).toBeVisible();
    await expect(page.getByTestId("petition-doubt-banner")).toContainText("PODE ter sido protocolada");
    await expect(page.getByRole("button", { name: /Protocolar|Tentar enviar|Enviar \(demonstração\)/ })).toHaveCount(0); // sem reenvio às cegas
    await expect(page.getByTestId("petition-attempts")).toContainText("Sem confirmação");
    await page.screenshot({ path: "/tmp/legalos-petition-unknown.png", fullPage: true });

    const panel = page.getByTestId("reconcile-panel");
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "Conferi: não foi protocolada" }).click();
    const confirmNo = panel.getByRole("button", { name: "Confirmar que não foi protocolada" });
    await expect(confirmNo).toBeDisabled(); // exige explicação
    await panel.getByLabel("Como e onde você conferiu?").fill("Conferi no PJe: não consta a petição.");
    await confirmNo.click();
    await expect(page.getByText("Falha no envio").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Tentar enviar de novo" })).toBeVisible(); // agora o reenvio é permitido
    await expect(page.getByTestId("petition-attempts")).toContainText("conferida: não protocolada");

    // ---------------------------------------------------------------- B: a conferência confirma, com o recibo do tribunal
    const b = await approvedPetition(page, id, `Contestação B ${id}`, `Petição B ${id}`);
    await makeUnknown(db, b);
    await page.goto(`/peticoes/${b}`);
    const panelB = page.getByTestId("reconcile-panel");
    await panelB.getByRole("button", { name: "Foi protocolada — registrar recibo" }).click();
    const save = panelB.getByRole("button", { name: "Registrar protocolo" });
    await expect(save).toBeDisabled(); // sem protocolo e recibo não há confirmação
    await panelB.getByLabel("Número do protocolo (como no recibo)").fill("0001234-56.2026.4.03.6100/001");
    await panelB.getByLabel("Recibo do tribunal").selectOption({ label: `Recibo ${id}.docx` });
    await save.click();
    await expect(page.getByText("Protocolada com confirmação oficial").first()).toBeVisible({ timeout: 15_000 });
    const card = page.getByTestId("petition-official-receipt");
    await expect(card).toContainText("0001234-56.2026.4.03.6100/001");
    await expect(card).toContainText("Registrado por uma pessoa do escritório");
    await expect(card.getByRole("link", { name: `Recibo ${id}.docx` })).toBeVisible();
    await expect(page.getByTestId("reconcile-panel")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Protocolar|Tentar enviar|Enviar \(demonstração\)/ })).toHaveCount(0);
    await page.screenshot({ path: "/tmp/legalos-petition-confirmed.png", fullPage: true });

    // ---------------------------------------------------------------- a lista usa os mesmos estados
    await page.goto("/peticoes");
    await expect(page.getByRole("row", { name: new RegExp(`Contestação B ${id}`) })).toContainText("Protocolada com confirmação oficial");
    await expect(page.getByRole("row", { name: new RegExp(`Contestação A ${id}`) })).toContainText("Falha no envio");
  } finally {
    await db.end();
  }
});

test("Peticionamento — demonstração nunca aparece como protocolo oficial", async ({ page }) => {
  test.setTimeout(150_000);
  const { id } = await signUpWithOffice(page, "pdm");
  await page.goto("/processos/novo");
  await page.getByLabel("Título do caso ou processo").fill(`Caso ${id}`);
  await page.getByRole("button", { name: "Cadastrar caso ou processo" }).click();
  await expect(page.getByRole("heading", { name: `Caso ${id}` })).toBeVisible();
  await page.goto("/documentos/modelos/novo");
  await page.getByLabel("Nome do modelo").fill(`Modelo ${id}`);
  await page.getByLabel("Texto do modelo").fill("# PEÇA\n\n{{processo.titulo}}");
  await page.getByRole("button", { name: "Criar modelo" }).click();
  await expect(page.getByRole("link", { name: `Modelo ${id}` })).toBeVisible();
  await page.goto("/documentos/gerar");
  await page.getByLabel("Modelo").selectOption({ label: `Modelo ${id}` });
  await page.getByLabel("Título do documento").fill(`Peça ${id}`);
  await page.getByLabel("Processo").selectOption({ label: `Caso ${id}` });
  await page.getByRole("button", { name: "Gerar documento (.docx)" }).click();
  await expect(page.getByRole("heading", { name: `Peça ${id}.docx` })).toBeVisible();

  await approvedPetition(page, id, `Petição demo ${id}`, `Peça ${id}`);
  await page.getByRole("button", { name: "Enviar (demonstração)" }).click();
  await expect(page.getByText("Enviada em demonstração").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("petition-test-banner")).toContainText("Nada foi enviado a nenhum tribunal");
  await expect(page.getByText("Protocolada com confirmação oficial")).toHaveCount(0);
  await expect(page.getByTestId("petition-official-receipt")).toHaveCount(0);
  await expect(page.getByText("Protocolo de teste (sem valor oficial):")).toBeVisible();
});
