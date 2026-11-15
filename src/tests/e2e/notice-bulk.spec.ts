import { test } from "@playwright/test";
import { expectRetired, expectRetiredApi } from "./box-retired-checks";

test("Box retirado bloqueia revisão de publicações em lote", async ({ request }) => {
  await expectRetired(request, ["/caixa-de-entrada/lote"]);
  await expectRetiredApi(request, "/api/v1/notices", "GET");
});
