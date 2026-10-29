import { describe, expect, it } from "vitest";
import { NAV_ITEMS, navItemInBoxVersion } from "@/config/navigation";
import { boxV2Enabled, boxV2EnabledAnywhere, boxV2PilotOrgs } from "@/lib/features";

const labels = (v2: boolean) => NAV_ITEMS.filter((n) => n.space === "box" && navItemInBoxVersion(n, v2)).map((n) => n.label);

describe("chave LEGALOS_BOX_V2", () => {
  it("desligada por padrão; só 1/true/on ligam", () => {
    const off = (env: Record<string, string>) => boxV2Enabled("org-a", env);
    expect(off({})).toBe(false);
    expect(off({ LEGALOS_BOX_V2: "" })).toBe(false);
    expect(off({ LEGALOS_BOX_V2: "0" })).toBe(false);
    expect(off({ LEGALOS_BOX_V2: "false" })).toBe(false);
    expect(off({ LEGALOS_BOX_V2: "1" })).toBe(true);
    expect(off({ LEGALOS_BOX_V2: " TRUE " })).toBe(true);
    expect(off({ LEGALOS_BOX_V2: "on" })).toBe(true);
    expect(boxV2Enabled(undefined, { LEGALOS_BOX_V2: "1" })).toBe(true); // a chave geral vale mesmo sem escritório
    expect(boxV2EnabledAnywhere({})).toBe(false);
  });

  it("piloto por escritório: só os ids listados ligam; a chave geral liga todos; lista vazia não liga ninguém", () => {
    const env = { LEGALOS_BOX_V2_ORGS: " 11111111-aaaa , 22222222-BBBB ,, " };
    expect(boxV2PilotOrgs(env)).toEqual(["11111111-aaaa", "22222222-bbbb"]);
    expect(boxV2Enabled("11111111-aaaa", env)).toBe(true);
    expect(boxV2Enabled("22222222-bbbb", env)).toBe(true); // sem diferenciar maiúsculas
    expect(boxV2Enabled("22222222-BBBB", env)).toBe(true);
    expect(boxV2Enabled("33333333-cccc", env)).toBe(false); // escritório fora do piloto continua com o Box antigo
    expect(boxV2Enabled(undefined, env)).toBe(false);
    expect(boxV2Enabled(null, env)).toBe(false);
    expect(boxV2Enabled("33333333-cccc", { ...env, LEGALOS_BOX_V2: "1" })).toBe(true);
    expect(boxV2Enabled("x", { LEGALOS_BOX_V2_ORGS: "" })).toBe(false);
    expect(boxV2Enabled("x", { LEGALOS_BOX_V2_ORGS: " , " })).toBe(false);
    expect(boxV2EnabledAnywhere(env)).toBe(true);
    expect(boxV2EnabledAnywhere({ LEGALOS_BOX_V2_ORGS: " , " })).toBe(false);
  });

  it("sem a chave, o menu do Box é exatamente o antigo (nenhum item novo aparece)", () => {
    const keys = NAV_ITEMS.filter((n) => n.space === "box" && navItemInBoxVersion(n, false)).map((n) => n.key);
    expect(keys).toEqual(["box-overview", "inbox", "petitions", "certificates", "pje-connect", "integrations", "monitoring", "prototypes"].filter((k) => k !== "prototypes"));
    expect(keys.some((k) => ["box-processes", "box-connections", "box-health", "box-settings"].includes(k))).toBe(false);
  });

  it("com a chave, o menu segue a navegação nova, sem páginas antigas duplicadas", () => {
    expect(labels(true)).toEqual(["Visão geral do Box", "Caixa de entrada", "Processos", "Peticionamento", "Conexões Judiciais", "Operação e Saúde", "Configurações do Box"]);
    const keys = NAV_ITEMS.filter((n) => n.space === "box" && navItemInBoxVersion(n, true)).map((n) => n.key);
    for (const legacy of ["certificates", "pje-connect", "integrations", "monitoring"]) expect(keys).not.toContain(legacy);
  });

  it("itens de outros espaços não são afetados pela chave", () => {
    const other = (v2: boolean) => NAV_ITEMS.filter((n) => n.space !== "box" && navItemInBoxVersion(n, v2)).map((n) => n.key);
    expect(other(true)).toEqual(other(false));
  });

  it("toda página nova do menu existe como rota", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    for (const n of NAV_ITEMS.filter((x) => x.box === "v2")) {
      expect(fs.existsSync(path.join(process.cwd(), "src/app/(dashboard)", n.href, "page.tsx")), n.href).toBe(true);
    }
  });
});
