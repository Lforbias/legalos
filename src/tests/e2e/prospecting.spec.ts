import { expect, test } from "@playwright/test";
import { Client } from "pg";
import { totpCode, totpStep } from "../../lib/security/totp";
const DB = process.env.TEST_DATABASE_URL ?? "postgresql://legalos:legalos_dev@localhost:5432/legalos_test";

test('prospecção: acesso protegido, mapa, filtros e acompanhamento persistente', async ({ page }) => {
  test.setTimeout(120_000);
  const id = Date.now().toString(36);
  const email = `prospect-${id}@example.test`;
  const cnpj = '00000000000200';
  await page.goto('/admin/comercial/prospeccao');
  await expect(page).toHaveURL(/login/);
  await page.goto('/register');
  await page.getByLabel('Nome completo').fill('Administrador de teste');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('SenhaForte123');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await page.getByLabel('Nome do escritório').fill(`Teste Prospecção ${id}`);
  await page.getByRole('button', { name: 'Criar escritório' }).click();
  await expect(page.getByRole('link', { name: 'Visão geral do Func', exact: true })).toBeVisible();
  expect((await page.goto('/admin/comercial/prospeccao'))?.status()).toBe(404);
  const db = new Client({ connectionString: DB });
  await db.connect();
  try {
    await db.query('INSERT INTO platform_admins (user_id) SELECT id FROM users WHERE email = $1', [email]);
    await page.goto('/admin/comercial/prospeccao');
    await expect(page).toHaveURL(/\/conta/);
    await page.getByRole('button', { name: 'Ativar verificação em duas etapas' }).click();
    const secret = (await page.getByTestId('mfa-secret').textContent())!.trim();
    await page.getByLabel('Código de 6 dígitos').fill(totpCode(secret, totpStep()));
    await page.getByRole('button', { name: 'Ativar', exact: true }).click();
    await expect(page.getByTestId('recovery-codes').locator('li')).toHaveCount(10);
    await page.getByRole('button', { name: 'Já guardei os códigos' }).click();
    await db.query(`INSERT INTO commercial_prospects (cnpj,legal_name,address,neighborhood,cnae,source_month,latitude,longitude,location_accuracy,location_source) VALUES ($1,'Escritório fictício — demonstração','Endereço fictício','Bela Vista','6911701','2026-10',-23.5614,-46.6559,'POSTAL_CODE','Fixture de teste')`, [cnpj]);
    await page.goto('/admin/comercial/prospeccao');
    await expect(page.getByRole('heading', { name: 'Escritórios em São Paulo.' })).toBeVisible();
    await expect(page.locator('.leaflet-container')).toBeVisible();
    await expect(page.locator('.leaflet-interactive')).toHaveCount(1);
    await page.getByLabel('Nome, CNPJ ou CEP').fill(cnpj);
    await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Escritório fictício — demonstração', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1100 });
    await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible({ timeout: 20000 });
    await page.screenshot({ path: '/tmp/legalos-prospeccao-preview.png', fullPage: true });
    await page.getByRole('link', { name: 'Escritório fictício — demonstração', exact: true }).click();
    await page.getByRole('combobox', { name: 'Etapa', exact: true }).selectOption('QUALIFIED');
    await page.getByLabel('Não contatar este escritório').check();
    await page.getByLabel('Anotações', { exact: true }).fill('Solicitou não receber contatos.');
    await page.getByRole('button', { name: 'Salvar acompanhamento' }).click();
    await expect(page.getByRole('status')).toHaveText('Cadastro salvo.');
    await page.reload();
    await expect(page.getByLabel('Não contatar este escritório')).toBeChecked();
    await expect(page.getByLabel('Próximo retorno')).toBeDisabled();
    await expect(page.getByLabel('Anotações', { exact: true })).toHaveValue('Solicitou não receber contatos.');
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    }
  } finally {
    await db.query('DELETE FROM commercial_prospects WHERE cnpj = $1', [cnpj]);
    await db.end();
  }
});
