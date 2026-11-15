import { describe, expect, it } from "vitest";
import {
  COURT_CATALOG,
  JURISDICTIONAL_COURTS,
  REFERENCE_INSTITUTIONS,
  REGIONAL_CONNECTOR_COURTS,
  getCourtByCode,
  courtsByBranch,
  courtsByEngine,
  courtsByUf,
  BRANCH_LABEL,
  DEGREE_LABEL,
  ENGINE_LABEL,
} from "@/lib/judicial/court-catalog";
import { EPROC_PORTAL_TARGETS } from "@/lib/robots/eproc/targets";
import { PJE_TARGETS } from "@/lib/robots/pje/targets";

describe("court catalog", () => {
  it("limits regional connector scope to 19 courts in the requested branches and states", () => {
    expect(REGIONAL_CONNECTOR_COURTS).toHaveLength(19);
    expect(REGIONAL_CONNECTOR_COURTS.every((court) => ["ESTADUAL", "FEDERAL", "TRABALHO"].includes(court.branch))).toBe(true);
    expect(REGIONAL_CONNECTOR_COURTS.every((court) => court.ufs.some((uf) => ["ES", "MG", "RJ", "SP", "PR", "RS", "SC"].includes(uf)))).toBe(true);
    expect(REGIONAL_CONNECTOR_COURTS.some((court) => court.branch === "ELEITORAL" || court.branch === "MILITAR_ESTADUAL")).toBe(false);
  });

  it("has exactly 91 jurisdictional courts", () => {
    expect(JURISDICTIONAL_COURTS.length).toBe(91);
  });

  it("has exactly 4 reference institutions", () => {
    expect(REFERENCE_INSTITUTIONS.length).toBe(4);
    const codes = REFERENCE_INSTITUTIONS.map((c) => c.code).sort();
    expect(codes).toEqual(["CJF", "CNJ", "CSJT", "STF"]);
  });

  it("all codes are unique", () => {
    const codes = COURT_CATALOG.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("has 27 state courts", () => {
    expect(courtsByBranch("ESTADUAL").length).toBe(27);
  });

  it("has 6 federal courts", () => {
    expect(courtsByBranch("FEDERAL").length).toBe(6);
  });

  it("has 24 labor courts", () => {
    expect(courtsByBranch("TRABALHO").length).toBe(24);
  });

  it("has 27 electoral courts", () => {
    expect(courtsByBranch("ELEITORAL").length).toBe(27);
  });

  it("has 3 state military courts", () => {
    expect(courtsByBranch("MILITAR_ESTADUAL").length).toBe(3);
    const codes = courtsByBranch("MILITAR_ESTADUAL").map((c) => c.code).sort();
    expect(codes).toEqual(["TJMMG", "TJMRS", "TJMSP"]);
  });

  it("has 4 superior courts", () => {
    expect(courtsByBranch("SUPERIOR").length).toBe(4);
    const codes = courtsByBranch("SUPERIOR").map((c) => c.code).sort();
    expect(codes).toEqual(["STJ", "STM", "TSE", "TST"]);
  });

  it("getCourtByCode returns the correct court", () => {
    const trf3 = getCourtByCode("TRF3");
    expect(trf3).not.toBeNull();
    expect(trf3!.name).toContain("3ª Região");
    expect(trf3!.branch).toBe("FEDERAL");
    expect(trf3!.integrationStatus).toBe("ADAPTER_WIP");
  });

  it("getCourtByCode returns null for unknown codes", () => {
    expect(getCourtByCode("INVALID")).toBeNull();
  });

  it("courtsByUf returns courts for a given UF", () => {
    const sp = courtsByUf("SP");
    const codes = sp.map((c) => c.code);
    expect(codes).toContain("TJSP");
    expect(codes).toContain("TRF3");
    expect(codes).toContain("TRT2");
    expect(codes).toContain("TRT15");
    expect(codes).toContain("TRE-SP");
  });

  it("courtsByEngine returns PJe courts", () => {
    const pje = courtsByEngine("PJE");
    expect(pje.length).toBeGreaterThan(50);
    expect(pje.every((c) => c.engine === "PJE")).toBe(true);
  });

  it("every jurisdictional court has at least one degree", () => {
    for (const c of JURISDICTIONAL_COURTS) {
      expect(c.degrees.length).toBeGreaterThan(0);
    }
  });

  it("reference institutions are in REFERENCIA branch", () => {
    for (const c of REFERENCE_INSTITUTIONS) {
      expect(c.branch).toBe("REFERENCIA");
    }
  });

  it("no court has integrationStatus OPERATIONAL without a real reason", () => {
    const operational = JURISDICTIONAL_COURTS.filter((c) => c.integrationStatus === "OPERATIONAL");
    expect(operational.length).toBe(0);
  });

  it("does not mark TRF3 validated before an authorized real login", () => {
    const trf3 = getCourtByCode("TRF3");
    expect(trf3?.integrationStatus).toBe("ADAPTER_WIP");
    expect(trf3?.verifiedAt).toBeNull();
    expect(trf3?.verifiedSource).toMatch(/não homologado/i);
  });

  it("uses the currently deployed eproc engines for TJMG, TJRJ, TJSP, and TRF6", () => {
    for (const code of ["TJMG", "TJRJ", "TJSP", "TRF6"]) {
      expect(getCourtByCode(code)?.engine).toBe("EPROC");
    }
  });

  it("keeps PJe and eproc portal targets inside the regional state, federal, and labor scope", () => {
    const regionalCodes = new Set(REGIONAL_CONNECTOR_COURTS.map((court) => court.code));
    expect(PJE_TARGETS.filter((target) => regionalCodes.has(target.key.split("-")[0]!.toUpperCase())).length).toBeGreaterThan(0);
    expect(EPROC_PORTAL_TARGETS.length).toBeGreaterThan(0);
    expect(EPROC_PORTAL_TARGETS.every((target) => regionalCodes.has(target.courtCode))).toBe(true);
    expect(EPROC_PORTAL_TARGETS.every((target) => /^https:\/\//.test(target.loginUrl))).toBe(true);
    expect(new Set(EPROC_PORTAL_TARGETS.map((target) => target.key)).size).toBe(EPROC_PORTAL_TARGETS.length);
  });

  it("BRANCH_LABEL covers all branches used in the catalog", () => {
    const branches = new Set(COURT_CATALOG.map((c) => c.branch));
    for (const b of branches) {
      expect(BRANCH_LABEL[b]).toBeTruthy();
    }
  });

  it("all labels exist for defined enums", () => {
    expect(Object.keys(BRANCH_LABEL).length).toBeGreaterThanOrEqual(7);
    expect(Object.keys(DEGREE_LABEL).length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(ENGINE_LABEL).length).toBeGreaterThanOrEqual(5);
  });
});
