import { test } from "@playwright/test";
import { expectRetired, expectRetiredApi } from "./box-retired-checks";

test("Box 2.0 e Box antigo estão retirados", async ({ request }) => {
  await expectRetired(request, ["/box", "/box/conexoes", "/box/saude", "/box/processos", "/box/configuracoes", "/box/configurar"]);
  await expectRetiredApi(request, "/api/box/events", "GET");
});
