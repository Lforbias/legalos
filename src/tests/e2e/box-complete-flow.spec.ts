import { test } from "@playwright/test";
import { expectRetired, expectRetiredApi } from "./box-retired-checks";

test("Box retirado bloqueia cadastro de intimações e preserva a fronteira HTTP", async ({ request }) => {
  await expectRetired(request, ["/caixa-de-entrada", "/caixa-de-entrada/nova"]);
  await expectRetiredApi(request, "/api/v1/notices", "POST");
});

test("Box retirado bloqueia autos e execução da fila", async ({ request }) => {
  await expectRetired(request, ["/processos/00000000-0000-4000-8000-000000000001/autos"]);
  await expectRetiredApi(request, "/api/cron/autos-queue", "POST");
});
