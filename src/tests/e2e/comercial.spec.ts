import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { totpCode, totpStep } from "../../lib/security/totp";
const DB = process.env.TEST_DATABASE_URL ?? "postgresql://legalos:legalos_dev@localhost:5432/legalos_test";

test('Comercial: amostra entra no funil, mapa e ficha sem duplicar', async ({ page }) => {
  test.setTimeout(120_000);
  const email = `comercial-ui-${Date.now()}@example.test`;
  await page.goto('/register');
  await page.getByLabel('Nome completo').fill('Gestor comercial de teste');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('SenhaForte123');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByLabel('Nome do escritório').fill('Escritório de teste comercial');
  await page.getByRole('button', { name: 'Criar escritório' }).click();
  await expect(page.getByRole('link', { name: 'Visão geral do Func', exact: true })).toBeVisible();
  expect((await page.goto('/comercial'))?.status()).toBe(404);
  const db = new Client({ connectionString: DB }); await db.connect();
  const cnpj = '98765432000279';
  try {
    await db.query('INSERT INTO platform_admins (user_id) SELECT id FROM users WHERE email=$1', [email]);
    await page.goto('/comercial');
    await expect(page).toHaveURL(/\/conta/);
    await page.getByRole('button', { name: 'Ativar verificação em duas etapas' }).click();
    const secret = (await page.getByTestId('mfa-secret').textContent())!.trim();
    await page.getByLabel('Código de 6 dígitos').fill(totpCode(secret, totpStep()));
    await page.getByRole('button', { name: 'Ativar', exact: true }).click();
    await expect(page.getByTestId('recovery-codes').locator('li')).toHaveCount(10);
    await page.getByRole('button', { name: 'Já guardei os códigos' }).click();
    await db.query(`INSERT INTO commercial_prospects (cnpj,legal_name,address,cnae,source_month,latitude,longitude,location_accuracy) VALUES ($1,'TESTE UI AMOSTRA ADVOCACIA','Rua de teste 1','6911701','2026-10',-23.55,-46.63,'POSTAL_CODE')`, [cnpj]);
    await page.goto('/comercial/base');
    await page.getByRole('button', { name: 'Adicionar amostra ao Comercial (até 200)' }).click();
    await expect(page.getByRole('status')).toContainText('adicionados;');
    const { rows } = await db.query('SELECT id FROM com_prospects WHERE cnpj=$1', [cnpj]);
    expect(rows).toHaveLength(1);
    await page.getByRole('button', { name: 'Adicionar amostra ao Comercial (até 200)' }).click();
    await expect(page.getByRole('status')).toContainText('0 adicionados');
    await page.goto(`/comercial/escritorios/${rows[0].id}`);
    await page.getByRole('combobox', { name: 'Etapa do funil' }).selectOption('QUALIFICADO');
    await expect(page.getByRole('combobox', { name: 'Etapa do funil' })).toHaveValue('QUALIFICADO');
    await page.getByLabel('Anotações', { exact: true }).fill('Anotação persistida pelo teste');
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page.getByText('Salvo.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Anotações', { exact: true })).toHaveValue('Anotação persistida pelo teste');
    for (const url of ['/comercial','/comercial/funil','/comercial/precos','/comercial/projecao','/comercial/equipe','/comercial/importar']) {
      expect((await page.goto(url))?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
    await page.goto('/comercial/mapa');
    await expect(page.locator('.leaflet-container')).toBeVisible();
    await expect(page.locator('.leaflet-interactive').first()).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1100 });
    await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible({ timeout: 25000 });
    await expect(page.locator('.leaflet-zoom-anim')).toHaveCount(0);
    await page.screenshot({ path: '/tmp/legalos-comercial-corrigido.png', fullPage: true });
  } finally {
    await db.query('DELETE FROM com_prospects WHERE cnpj=$1', [cnpj]);
    await db.query('DELETE FROM commercial_prospects WHERE cnpj=$1', [cnpj]);
    await db.end();
  }
});
