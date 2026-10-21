import { expect, test } from "@playwright/test";

test("health e ready respondem sem login e só devolvem booleanos", async ({ request }) => {
  expect((await request.get("/api/health")).status()).toBe(200);
  const r = await request.get("/api/ready");
  expect(r.status()).toBe(200);
  expect(await r.json()).toEqual({ status: "ready", checks: { database: true, migrations: true, storage: true } });
});
