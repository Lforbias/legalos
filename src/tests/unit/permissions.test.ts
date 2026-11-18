import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, PERMISSION_GROUPS, isPermissionKey } from "@/lib/permissions/catalog";
import { SYSTEM_ROLES } from "@/lib/permissions/roles";
import { isSubset } from "@/lib/permissions/check";
import { NAV_ITEMS } from "@/config/navigation";

describe("catálogo de permissões", () => {
  it("não possui chaves duplicadas e segue o formato recurso:ação", () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    for (const p of ALL_PERMISSIONS) expect(p).toMatch(/^[a-z]+:[a-z]+$/);
    expect(PERMISSION_GROUPS.length).toBeGreaterThan(0);
  });

  it("valida chaves desconhecidas", () => {
    expect(isPermissionKey("members:read")).toBe(true);
    expect(isPermissionKey("root:everything")).toBe(false);
  });

  it("todo item de navegação protegido usa uma permissão existente", () => {
    for (const n of NAV_ITEMS) if (n.permission) expect(isPermissionKey(n.permission)).toBe(true);
  });
});

describe("perfis de sistema", () => {
  const role = (k: string) => SYSTEM_ROLES.find((r) => r.key === k)!;

  it("OWNER possui todas as permissões; ADMIN tudo exceto cobrança", () => {
    expect(new Set(role("OWNER").permissions)).toEqual(new Set(ALL_PERMISSIONS));
    expect(role("ADMIN").permissions).not.toContain("billing:manage");
    expect(role("ADMIN").permissions.length).toBe(ALL_PERMISSIONS.length - 1);
  });

  it("cliente externo só acessa o portal", () => {
    expect(role("CLIENT").permissions).toEqual(["portal:access"]);
  });

  it("apenas o proprietário gerencia a cobrança", () => {
    for (const r of SYSTEM_ROLES) expect(r.permissions.includes("billing:manage")).toBe(r.key === "OWNER");
  });

  it("perfis operacionais não gerenciam perfis nem membros", () => {
    for (const k of ["LAWYER", "CONTROLLER", "FINANCE", "ASSISTANT", "CLIENT"]) {
      expect(role(k).permissions).not.toContain("roles:manage");
      expect(role(k).permissions).not.toContain("members:manage");
    }
  });

  it("somente permissões válidas e sem duplicatas", () => {
    for (const r of SYSTEM_ROLES) {
      expect(new Set(r.permissions).size).toBe(r.permissions.length);
      for (const p of r.permissions) expect(isPermissionKey(p)).toBe(true);
    }
  });
});

describe("isSubset", () => {
  it("detecta escalonamento", () => {
    expect(isSubset(["a", "b"], new Set(["a", "b", "c"]))).toBe(true);
    expect(isSubset(["a", "z"], new Set(["a", "b"]))).toBe(false);
    expect(isSubset([], new Set())).toBe(true);
  });
});

describe("permissões do Cowork", () => {
  const role = (k: string) => SYSTEM_ROLES.find((r) => r.key === k)!;
  it("todos os perfis internos usam o Cowork; o cliente externo não", () => {
    for (const k of ["OWNER", "ADMIN", "LAWYER", "CONTROLLER", "FINANCE", "ASSISTANT"]) expect(role(k).permissions).toContain("cowork:read");
    expect(role("CLIENT").permissions.some((p) => p.startsWith("cowork:"))).toBe(false);
  });
  it("administração do Cowork e gestão de participantes ficam com proprietário e administrador", () => {
    for (const r of SYSTEM_ROLES) {
      expect(r.permissions.includes("cowork:manage"), r.key).toBe(["OWNER", "ADMIN"].includes(r.key));
      expect(r.permissions.includes("cowork:members"), r.key).toBe(["OWNER", "ADMIN"].includes(r.key));
    }
  });
  it("painel do trabalho só para gestão (controladoria e administração)", () => {
    for (const r of SYSTEM_ROLES) expect(r.permissions.includes("cowork:insights"), r.key).toBe(["OWNER", "ADMIN", "CONTROLLER"].includes(r.key));
  });
  it("a migração concede aos perfis do sistema as mesmas permissões do código", async () => {
    const fs = await import("node:fs");
    const sql = fs.readFileSync("prisma/migrations/20270119000000_cowork/migration.sql", "utf8");
    const grants = (keys: string) => [...sql.matchAll(/ARRAY\[([^\]]+)\]\s+WHERE is_system AND key (?:IN \(([^)]+)\)|= '([A-Z]+)')/g)].filter((m) => (m[2] ?? `'${m[3]}'`).includes(`'${keys}'`)).flatMap((m) => m[1]!.split(",").map((s) => s.trim().replace(/'/g, "")));
    for (const k of ["OWNER", "ADMIN", "LAWYER", "CONTROLLER", "FINANCE", "ASSISTANT"]) {
      const fromCode = role(k).permissions.filter((p) => p.startsWith("cowork:")).sort();
      expect(grants(k).sort(), k).toEqual(fromCode);
    }
  });
});
