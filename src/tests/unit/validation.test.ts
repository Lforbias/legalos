import { describe, expect, it } from "vitest";
import { registerSchema, loginSchema } from "@/modules/auth/schemas";
import { createOrganizationSchema } from "@/modules/organizations/schemas";
import { inviteSchema, roleSchema } from "@/modules/team/schemas";
import { slugify } from "@/lib/validation/slug";
import { isValidTimeZone } from "@/lib/validation/timezone";
import { formatDate, relativeTime } from "@/lib/dates/format";

describe("schemas de autenticação", () => {
  it("normaliza o e-mail e valida a política de senha", () => {
    const ok = registerSchema.parse({ name: "Ana Paula", email: "  ANA@Example.COM ", password: "SenhaForte123" });
    expect(ok.email).toBe("ana@example.com");
    expect(registerSchema.safeParse({ name: "Ana", email: "ana@example.com", password: "curta1" }).success).toBe(false);
    expect(registerSchema.safeParse({ name: "Ana", email: "ana@example.com", password: "somenteletrasaqui" }).success).toBe(false);
    expect(registerSchema.safeParse({ name: "A", email: "ana@example.com", password: "SenhaForte123" }).success).toBe(false);
    expect(registerSchema.safeParse({ name: "Ana", email: "nao-e-email", password: "SenhaForte123" }).success).toBe(false);
  });

  it("login exige senha preenchida", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("schemas de escritório e equipe", () => {
  it("valida fuso horário e nome", () => {
    expect(createOrganizationSchema.safeParse({ name: "Silva & Souza", timezone: "America/Sao_Paulo" }).success).toBe(true);
    expect(createOrganizationSchema.safeParse({ name: "Silva", timezone: "Mars/Olympus" }).success).toBe(false);
    expect(createOrganizationSchema.safeParse({ name: "S", timezone: "UTC" }).success).toBe(false);
  });

  it("convite exige uuid de perfil", () => {
    expect(inviteSchema.safeParse({ email: "x@y.co", roleId: "nao-uuid" }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: "x@y.co", roleId: "3f2b8a6e-5d0c-4c7e-9a41-2b7e6f1a9c10" }).success).toBe(true);
  });

  it("perfil exige nome", () => {
    expect(roleSchema.safeParse({ name: "", permissions: [] }).success).toBe(false);
    expect(roleSchema.safeParse({ name: "Gestor", permissions: ["members:read"] }).success).toBe(true);
  });
});

describe("utilitários", () => {
  it("slugify remove acentos e símbolos", () => {
    expect(slugify("Machado & Associados Advocacia")).toBe("machado-associados-advocacia");
    expect(slugify("  Ção/Ñandú  ")).toBe("cao-nandu");
    expect(slugify("!!!")).toBe("");
  });

  it("valida fusos IANA", () => {
    expect(isValidTimeZone("America/Sao_Paulo")).toBe(true);
    expect(isValidTimeZone("Nope/Nope")).toBe(false);
  });

  it("formata datas no fuso informado (UTC → local)", () => {
    // 2026-01-01T02:00Z ainda é 31/12 em São Paulo (UTC-3)
    expect(formatDate("2026-01-01T02:00:00Z", "America/Sao_Paulo")).toBe("31/12/2025");
    expect(formatDate("2026-01-01T02:00:00Z", "UTC")).toBe("01/01/2026");
  });

  it("relativeTime em português", () => {
    const now = new Date("2026-10-17T12:00:00Z");
    expect(relativeTime("2026-10-17T11:58:00Z", now)).toContain("2 minutos");
    expect(relativeTime("2026-10-15T12:00:00Z", now)).toBe("anteontem");
    expect(relativeTime("2026-10-14T12:00:00Z", now)).toContain("3 dias");
  });
});
