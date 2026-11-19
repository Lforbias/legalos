import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { THEME_SCRIPT, THEME_SCRIPT_CSP_HASH } from "@/lib/theme-script";

describe("script de tema", () => {
  it("o hash liberado na CSP corresponde ao texto do script", () => {
    const hash = createHash("sha256").update(THEME_SCRIPT).digest("base64");
    expect(THEME_SCRIPT_CSP_HASH).toBe(`'sha256-${hash}'`);
  });

  it("começa escuro e respeita a escolha salva", () => {
    expect(THEME_SCRIPT).toContain("localStorage.getItem('lo-theme')||'dark'");
    expect(THEME_SCRIPT).toContain("prefers-color-scheme: light");
  });
});
