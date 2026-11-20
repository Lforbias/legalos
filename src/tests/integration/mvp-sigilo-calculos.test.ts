import { beforeAll, describe, expect, it } from "vitest";
import { createCase } from "@/server/services/case.service";
import { listCalculations, runCalculation, saveCalculation } from "@/server/services/calculation.service";
import { ConflictError } from "@/lib/permissions/check";
import { addMember, makeOrgWithOwner } from "./helpers";

const caseBase = { number: "", legacyNumber: "", title: "Caso", area: "", court: "TJSP", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };

describe("MVP — cálculos: sigilo na lista e calculadora trabalhista escondida", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  beforeAll(async () => {
    A = await makeOrgWithOwner("mvp-calc");
    lawyer = await addMember(A.org.id, "LAWYER", "mvp-calc-law");
  });

  it("cálculo de processo sigiloso não aparece na lista de quem não vê o processo", async () => {
    const secret = await createCase(A.ctx, { ...caseBase, title: "Sigiloso MVP", confidential: true });
    const open = await createCase(A.ctx, { ...caseBase, title: "Aberto MVP" });
    const input = { actKey: "cpc-contestacao", intimacao: "2026-10-19" };
    await saveCalculation(A.ctx, "PRAZO", input, { caseId: secret.id });
    await saveCalculation(A.ctx, "PRAZO", input, { caseId: open.id });
    await saveCalculation(A.ctx, "PRAZO", input);
    const asLawyer = await listCalculations(lawyer.ctx);
    expect(asLawyer.some((r) => r.caseId === secret.id)).toBe(false);
    expect(asLawyer.some((r) => r.caseId === open.id)).toBe(true);
    expect(asLawyer.some((r) => r.caseId === null)).toBe(true);
    const asOwner = await listCalculations(A.ctx);
    expect(asOwner.some((r) => r.caseId === secret.id)).toBe(true);
  });

  it("atualização trabalhista fica indisponível sem LEGALOS_CALC_TRABALHISTA=1", async () => {
    delete process.env.LEGALOS_CALC_TRABALHISTA;
    await expect(runCalculation(A.ctx, "TRABALHISTA", {})).rejects.toBeInstanceOf(ConflictError);
  });
});
