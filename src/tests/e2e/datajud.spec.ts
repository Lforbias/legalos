import { expect, test } from "@playwright/test";

const password = "SenhaForte123";
const uid = () => Math.random().toString(36).slice(2, 8);

test("DataJud sem chave: página de integrações avisa, não oferece ligar e o processo não mostra o botão", async ({ page }) => {
  const id = uid();
  await page.goto("/register");
  await page.getByLabel("Nome completo").fill(`Dona dj${id}`);
  await page.getByLabel("E-mail").fill(`dona-dj-${id}@example.test`);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await page.getByLabel("Nome do escritório").fill(`Banca dj ${id}`);
  await page.getByRole("button", { name: "Criar escritório" }).click();
  await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();

  await page.getByTestId("space-box").first().click();
  await expect(page.getByTestId("box-dashboard")).toBeVisible();
  await page.getByRole("link", { name: /Integrações/ }).first().click();
  await expect(page.getByRole("heading", { name: "Integrações" })).toBeVisible();
  await expect(page.getByText("Cadastre a chave pública do DataJud abaixo para habilitar a consulta.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Ligar DataJud/ })).toHaveCount(0);

  await page.goto("/processos/novo");
  await page.getByLabel("Título do processo").fill(`Caso DJ ${id}`);
  await page.getByRole("button", { name: "Cadastrar processo" }).click();
  await expect(page.getByRole("heading", { name: `Caso DJ ${id}` })).toBeVisible();
  await expect(page.getByRole("button", { name: "Consultar DataJud" })).toHaveCount(0);
});

test("DataJud: falha externa aparece sem referência genérica e último teste persiste", async ({ page }) => {
  const http = await import("node:http");
  let status = 503;
  let body: object = { error: "resposta-do-provedor-nao-deve-ser-exibida" };
  let authorization = "";
  const server = http.createServer((req, res) => {
    authorization = req.headers.authorization ?? "";
    req.resume(); req.on("end", () => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); });
  });
  await new Promise<void>(resolve => server.listen(3198, "127.0.0.1", resolve));
  try {
    const id = uid();
    await page.goto("/register");
    await page.getByLabel("Nome completo").fill(`Teste conexão ${id}`);
    await page.getByLabel("E-mail").fill(`datajud-conexao-${id}@example.test`);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Criar conta", exact: true }).click();
    await page.getByLabel("Nome do escritório").fill(`Conexão ${id}`);
    await page.getByRole("button", { name: "Criar escritório", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Olá/ })).toBeVisible();
    await page.goto("/integracoes");
    await page.getByLabel("Chave pública do DataJud", { exact: true }).fill("chave-publica-ficticia-para-teste-123");
    await page.getByRole("button", { name: "Guardar chave DataJud", exact: true }).click();
    await expect(page.getByText(/Chave guardada\. Teste/)).toBeVisible();
    await page.getByRole("button", { name: "Testar DataJud", exact: true }).click();
    await expect(page.getByText(/O DataJud está indisponível.*HTTP 503/)).toBeVisible();
    await expect(page.getByText(/Último teste:.*serviço indisponível/)).toBeVisible();
    await expect(page.getByText(/ref\./)).toHaveCount(0);
    expect(authorization).toBe("APIKey chave-publica-ficticia-para-teste-123");
    await page.reload();
    await expect(page.getByText(/Último teste:.*serviço indisponível/)).toBeVisible();
    status = 200; body = { hits: { hits: [] }, timed_out: true };
    await page.getByRole("button", { name: "Testar DataJud", exact: true }).click();
    await expect(page.getByText(/O DataJud retornou dados incompletos/)).toBeVisible();
    body = { hits: { hits: [] } };
    await page.getByRole("button", { name: "Testar DataJud", exact: true }).click();
    await expect(page.getByText("Conexão DataJud validada: autenticação aceita pelo CNJ.", { exact: true })).toBeVisible();
    await expect(page.getByText(/Último teste:.*autenticação aceita/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Último teste:.*autenticação aceita/)).toBeVisible();
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
