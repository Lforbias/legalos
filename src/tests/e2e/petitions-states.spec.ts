import { test } from "@playwright/test";
import { expectRetired, expectRetiredApi } from "./box-retired-checks";

test("Box retirado bloqueia edição e protocolo", async ({ request }) => {
  await expectRetired(request, ["/peticoes/nova", "/peticoes/fila"]);
  await expectRetiredApi(request, "/api/cron/petition-queue", "POST");
});

test("Box retirado não oferece recibo nem protocolo de demonstração", async ({ request }) => {
  await expectRetired(request, ["/peticoes", "/peticoes/00000000-0000-4000-8000-000000000001"]);
  await expectRetiredApi(request, "/api/petitions/00000000-0000-4000-8000-000000000001/receipt", "GET");
});
