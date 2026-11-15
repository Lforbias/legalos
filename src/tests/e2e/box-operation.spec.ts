import { test } from "@playwright/test";
import { expectRetired, expectRetiredApi } from "./box-retired-checks";

test("Box retirado bloqueia prévias autenticadas e o robô", async ({ request }) => {
  await expectRetired(request, ["/processos/00000000-0000-4000-8000-000000000001/autos/previa", "/integracoes/pje"]);
  await expectRetiredApi(request, "/api/cron/robots", "POST");
  await expectRetiredApi(request, "/api/v1/pje/discoveries", "POST");
});
