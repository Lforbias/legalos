import { test } from "@playwright/test";
import { expectRetired, expectRetiredApi } from "./box-retired-checks";

test("Cofre retirado não aceita acesso ou cadastro", async ({ request }) => {
  await expectRetired(request, ["/certificados", "/configuracoes/credenciais"]);
  await expectRetiredApi(request, "/api/certificates", "POST");
});
