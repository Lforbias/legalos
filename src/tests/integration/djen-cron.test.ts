import { afterEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/cron/djen/route";

const req = (auth?: string) => new Request("http://localhost/api/cron/djen", { method: "POST", headers: auth ? { authorization: auth } : {} });

describe("rota do agendador do DJEN", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });
  it("fica desligada sem segredo", async () => {
    expect((await POST(req("Bearer x"))).status).toBe(503);
  });
  it("recusa segredo ausente, errado ou curto; aceita o correto", async () => {
    process.env.CRON_SECRET = "segredo-de-teste-com-mais-de-24-chars";
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req("Bearer errado"))).status).toBe(401);
    const ok = await POST(req("Bearer segredo-de-teste-com-mais-de-24-chars"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toHaveProperty("total");
    process.env.CRON_SECRET = "curto";
    expect((await POST(req("Bearer curto"))).status).toBe(401);
  });
});
