import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

describe("Acesso público aos arquivos de marca", () => {
  it("permite carregar os logotipos sem sessão e preserva a CSP", () => {
    const response = proxy(new NextRequest("https://legalos.example/brand/legalos-func-light.svg"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-security-policy")).toContain("default-src 'self'");
  });

  it.each(["/processos", "/brand-private/arquivo.svg"])("continua exigindo sessão em %s", (path) => {
    const response = proxy(new NextRequest(`https://legalos.example${path}`));
    expect(response.status).toBe(307);
    const target = new URL(response.headers.get("location")!);
    expect(target.pathname).toBe("/login");
    expect(target.searchParams.get("next")).toBe(path);
  });
});
