import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runDjenAll: vi.fn(async () => ({ processed: 2 })),
  withJobRun: vi.fn(async (_name: string, _source: string, run: () => Promise<unknown>) => run()),
}));

vi.mock("@/server/services/djen.service", () => ({ runDjenAll: mocks.runDjenAll }));
vi.mock("@/server/job-runs", () => ({ withJobRun: mocks.withJobRun }));

import { POST } from "@/app/api/cron/djen/route";

const req = (auth?: string) => new Request("http://localhost/api/cron/djen", { method: "POST", headers: auth ? { authorization: auth } : {} });
const secret = "segredo-de-teste-com-mais-de-24-chars";

describe("rota do agendador do DJEN", () => {
  beforeEach(() => {
    mocks.runDjenAll.mockClear();
    mocks.withJobRun.mockClear();
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("exige configuração do segredo antes de iniciar a captura", async () => {
    delete process.env.CRON_SECRET;
    const response = await POST(req(`Bearer ${secret}`));
    expect(response.status).toBe(503);
    expect(mocks.runDjenAll).not.toHaveBeenCalled();
  });

  it("recusa segredo ausente, inválido ou curto sem iniciar a captura", async () => {
    process.env.CRON_SECRET = secret;
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req("Bearer incorreto"))).status).toBe(401);
    process.env.CRON_SECRET = "curto";
    expect((await POST(req("Bearer curto"))).status).toBe(401);
    expect(mocks.runDjenAll).not.toHaveBeenCalled();
  });

  it("executa a captura pública DJEN só com o segredo válido", async () => {
    process.env.CRON_SECRET = secret;
    const response = await POST(req(`Bearer ${secret}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ processed: 2 });
    expect(mocks.withJobRun).toHaveBeenCalledWith("djen", "CRON", expect.any(Function));
    expect(mocks.runDjenAll).toHaveBeenCalledOnce();
  });
});
