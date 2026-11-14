import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/cron/djen/route";

const req = (auth?: string) => new Request("http://localhost/api/cron/djen", { method: "POST", headers: auth ? { authorization: auth } : {} });

describe("rota retirada do agendador do DJEN", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });
  it("retorna removido sem iniciar captura, com ou sem segredo", async () => {
    expect((await POST(req("Bearer x"))).status).toBe(410);
    process.env.CRON_SECRET = "segredo-de-teste-com-mais-de-24-chars";
    const response = await POST(req("Bearer segredo-de-teste-com-mais-de-24-chars"));
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ error: "box_removed" });
  });
});
