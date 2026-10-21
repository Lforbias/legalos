import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PWA_SHORTCUTS, buildManifest } from "@/lib/pwa/manifest";

const root = process.cwd();

describe("PWA: manifesto", () => {
  const m = buildManifest();
  it("é instalável (standalone, ícones 192/512 e maskable existem em disco)", () => {
    expect(m.display).toBe("standalone");
    expect(m.start_url.startsWith("/")).toBe(true);
    const sizes = m.icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(m.icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const i of m.icons) expect(fs.existsSync(path.join(root, "public", i.src))).toBe(true);
  });
  it("atalhos apontam para rotas reais do painel", () => {
    for (const s of PWA_SHORTCUTS) expect(fs.existsSync(path.join(root, "src/app/(dashboard)", s.url, "page.tsx"))).toBe(true);
  });
});

describe("PWA: service worker (segurança)", () => {
  const sw = fs.readFileSync(path.join(root, "public/sw.js"), "utf8");
  it("só intercepta GET de mesma origem e só guarda estáticos versionados", () => {
    expect(sw).toContain('req.method !== "GET"');
    expect(sw).toContain("url.origin !== self.location.origin");
    expect(sw).toContain("/_next/static/");
    expect(sw).not.toMatch(/\/api\//);
  });
  it("não coloca páginas de navegação em cache (dados de clientes)", () => {
    const nav = sw.slice(sw.indexOf('req.mode === "navigate"'), sw.indexOf("// Estáticos versionados"));
    expect(nav).not.toContain("cache.put");
    expect(nav).not.toContain("c.put");
  });
  it("a tela offline existe e não carrega scripts", () => {
    const html = fs.readFileSync(path.join(root, "public/offline.html"), "utf8");
    expect(html).toContain("Sem conexão");
    expect(html).not.toMatch(/<script\s+src=/);
  });
});
