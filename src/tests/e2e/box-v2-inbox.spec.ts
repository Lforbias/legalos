import { test } from "@playwright/test";
import { expectRetired, expectRetiredApi } from "./box-retired-checks";

test("Flag do Box 2.0 não reativa caixa ou canal ao vivo", async ({ request }) => {
  await expectRetired(request, ["/caixa-de-entrada", "/box-v3/entrada"]);
  await expectRetiredApi(request, "/api/box/events", "GET");
});
