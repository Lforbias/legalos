import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HELP_GUIDES } from "@/modules/help/guides";
import { NAV_ITEMS } from "@/config/navigation";
import { SETTINGS_ITEMS } from "@/config/settings";

describe("Cobertura da central de ajuda", () => {
  it("cobre os módulos operacionais e configurações com atalhos para páginas existentes", () => {
    const shortcuts = HELP_GUIDES.flatMap(g => g.links);
    const keys = new Set(NAV_ITEMS.map(n => n.key));
    expect(new Set(HELP_GUIDES.map(g => g.id)).size).toBe(HELP_GUIDES.length);
    for (const link of shortcuts) {
      expect(keys.has(link.key), link.label).toBe(true);
      const pathname = link.href.split("?")[0]!;
      const file = path.join(process.cwd(), "src/app/(dashboard)", pathname, "page.tsx");
      expect(fs.existsSync(file), link.href).toBe(true);
    }
    for (const setting of SETTINGS_ITEMS) expect(shortcuts.some(l => l.href === setting.href), setting.label).toBe(true);
    for (const item of NAV_ITEMS.filter(n => !["help", "prototypes", "portal"].includes(n.key))) expect(shortcuts.some(l => l.key === item.key), item.label).toBe(true);
  });
});
