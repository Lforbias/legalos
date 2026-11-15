import { test } from "@playwright/test";
import { expectRetired } from "./box-retired-checks";

test("Box retirado bloqueia distribuição e acervo", async ({ request }) => {
  await expectRetired(request, ["/caixa-de-entrada/acervo", "/caixa-de-entrada/equipes", "/caixa-de-entrada/00000000-0000-4000-8000-000000000001"]);
});
