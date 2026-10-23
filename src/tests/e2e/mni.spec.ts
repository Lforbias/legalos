import { expect, test } from "@playwright/test";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);

test("Integrações mostra o conector PJe (MNI) desligado e avisa que falta a chave do cofre", async ({ page }) => {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona mni${id}`);
  await page.getByLabel("E-mail").fill(`dona-mni-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca mni ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();

  await page.goto("/integracoes");
  await expect(page.getByText("Conexões de tribunais — MNI 2.2.2")).toBeVisible();
  await expect(page.getByText("Nenhuma conexão cadastrada.")).toBeVisible();
  await expect(page.getByText(/CERT_ENCRYPTION_KEY/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Cadastrar conexão" })).toHaveCount(0);
});

test("Integrações mostra o monitoramento do DJEN, cadastra uma OAB e rejeita duplicata", async ({ page }) => {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona djen${id}`);
  await page.getByLabel("E-mail").fill(`dona-djen-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca djen ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();

  await page.goto("/integracoes");
  await expect(page.getByText("DJEN — publicações por OAB")).toBeVisible();
  await expect(page.getByText("Nenhuma OAB monitorada.")).toBeVisible();
  await page.getByLabel("Nome (quem é o advogado)").fill("Dra. Teste");
  await page.getByLabel("Número da OAB").fill("12345");
  await page.getByRole("button", { name: "Monitorar esta OAB" }).click();
  await expect(page.getByText("OAB BA 12345")).toBeVisible();
  await page.getByLabel("Nome (quem é o advogado)").fill("Outra");
  await page.getByLabel("Número da OAB").fill("12345");
  await page.getByRole("button", { name: "Monitorar esta OAB" }).click();
  await expect(page.getByText("Essa OAB já está sendo monitorada.")).toBeVisible();
});
