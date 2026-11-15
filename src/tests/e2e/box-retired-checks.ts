import { expect, type APIRequestContext } from "@playwright/test";

export async function expectRetired(request: APIRequestContext, paths: string[]) {
  for (const path of paths) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(404);
    expect(response.headers()["cache-control"], path).toBe("no-store");
  }
}

export async function expectRetiredApi(request: APIRequestContext, path: string, method = "GET") {
  const response = await request.fetch(path, { method, maxRedirects: 0 });
  expect(response.status(), path).toBe(410);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(await response.json()).toMatchObject({ error: { code: "box_removed" } });
}
