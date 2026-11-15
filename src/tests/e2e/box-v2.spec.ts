import { test } from "@playwright/test";
import { expectRetired, expectRetiredApi } from "./box-retired-checks";

test("Flag do Box 2.0 não reativa painéis nem conexões", async ({ request }) => {
  await expectRetired(request, ["/box", "/box/conexoes", "/box/saude", "/box-v3/conexoes"]);
  await expectRetiredApi(request, "/api/cron/mni", "POST");
});
