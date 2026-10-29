import { expect, test, type Page } from "@playwright/test";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);
function cnj(seq: string) {
  const base = `${seq}2024805` + "0001";
  const dd = String(98n - (BigInt(`${base}00`) % 97n)).padStart(2, "0");
  return `${seq}-${dd}.2024.8.05.0001`;
}

async function register(page: Page, label: string) {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Pessoa ${label}${id}`);
  await page.getByLabel("E-mail").fill(`${label}-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca ${label} ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Bom dia/ })).toBeVisible();
}

test("3.0-F4: importar processos por número, com inválidos e repetidos anotados", async ({ page }) => {
  await register(page, "l3f4");
  const n1 = cnj(`${Math.floor(1000000 + Math.random() * 8000000)}`);
  const n2 = cnj(`${Math.floor(1000000 + Math.random() * 8000000)}`);
  await page.goto("/processos");
  await page.getByRole("link", { name: "Importar por número" }).click();
  await expect(page.getByRole("heading", { name: "Importar processos" })).toBeVisible();
  // DataJud e MNI não estão disponíveis num escritório novo: as opções ficam desativadas e dizem por quê
  await expect(page.getByLabel(/Buscar os andamentos públicos/)).toBeDisabled();
  await expect(page.getByLabel(/Baixar os autos pelo MNI/)).toBeDisabled();
  await page.getByLabel("Números CNJ").fill(`${n1}\n${n2}\n${n1}\n123\n0000001-99.2024.8.05.0001`);
  await page.getByRole("button", { name: "Importar processos" }).click();
  await expect(page.getByRole("heading", { name: "Importação de processos" })).toBeVisible();
  const rows = page.getByTestId("import-items");
  await expect(rows).toContainText(n1);
  await expect(rows.getByText("Cadastrado", { exact: true })).toHaveCount(2);
  await expect(rows.getByText("Repetido", { exact: true })).toHaveCount(1);
  await expect(rows.getByText("Inválido", { exact: true })).toHaveCount(2);
  await expect(page.getByText("2 cadastrado(s)")).toBeVisible();

  // os processos estão na lista
  await page.goto("/processos");
  await expect(page.getByText(`Processo ${n1}`)).toBeVisible();
  await expect(page.getByText(`Processo ${n2}`)).toBeVisible();

  // reimportar não duplica
  await page.goto("/processos/importar");
  await page.getByLabel("Números CNJ").fill(n1);
  await page.getByRole("button", { name: "Importar processos" }).click();
  await expect(page.getByTestId("import-items").getByText("Já existia", { exact: true })).toHaveCount(1);
});
