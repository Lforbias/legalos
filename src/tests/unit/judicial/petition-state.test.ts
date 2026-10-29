import { describe, expect, it } from "vitest";
import { ConflictError, ValidationError } from "@/lib/permissions/check";
import { PETITION_STATUS_KEYS, PETITION_TRANSITIONS, canSubmitAgain, isDefiniteFailure, isLegacyUncertain, petitionStateInfo, statusAfterDelivery, type PetitionStatusKey } from "@/lib/judicial/petition-state";

describe("máquina de estados do peticionamento", () => {
  it("só tribunal real (produção) com protocolo E recibo oficial vira 'protocolada com confirmação oficial'", () => {
    expect(statusAfterDelivery({ environment: "PRODUCTION", protocol: "123", officialReceipt: true })).toBe("FILED_CONFIRMED");
    expect(statusAfterDelivery({ environment: "PRODUCTION", protocol: "123", officialReceipt: false })).toBe("AWAITING_CONFIRMATION");
    expect(statusAfterDelivery({ environment: "PRODUCTION", protocol: "  ", officialReceipt: true })).toBe("AWAITING_CONFIRMATION");
    expect(statusAfterDelivery({ environment: "PRODUCTION", protocol: null, officialReceipt: true })).toBe("AWAITING_CONFIRMATION");
    for (const environment of ["DEMO", "SIMULATED", "HOMOLOGATION"] as const) {
      expect(statusAfterDelivery({ environment, protocol: "123", officialReceipt: true })).toBe("SUBMITTED"); // teste nunca é oficial
    }
  });

  it("nenhum caminho leva de 'desconhecido' ou 'aguardando confirmação' a um novo envio", () => {
    const reach = (from: PetitionStatusKey) => {
      const seen = new Set<PetitionStatusKey>();
      const stack: PetitionStatusKey[] = [from];
      while (stack.length) for (const n of PETITION_TRANSITIONS[stack.pop()!]) if (!seen.has(n)) { seen.add(n); stack.push(n); }
      return seen;
    };
    // a partir de UNKNOWN só se chega a FILED_CONFIRMED ou FAILED; e de FAILED é que o reenvio passa a ser possível (com a trava de tentativa definitiva)
    expect(PETITION_TRANSITIONS.UNKNOWN).toEqual(["FILED_CONFIRMED", "FAILED"]);
    expect(PETITION_TRANSITIONS.AWAITING_CONFIRMATION).toEqual(["FILED_CONFIRMED", "FAILED"]);
    expect(PETITION_TRANSITIONS.UNKNOWN).not.toContain("SUBMITTING");
    expect(PETITION_TRANSITIONS.AWAITING_CONFIRMATION).not.toContain("SUBMITTING");
    // estados finais
    for (const s of ["FILED_CONFIRMED", "SUBMITTED", "CANCELED"] as const) expect(PETITION_TRANSITIONS[s]).toEqual([]);
    // só SUBMITTING chega a UNKNOWN / AWAITING_CONFIRMATION
    for (const s of PETITION_STATUS_KEYS) {
      if (s !== "SUBMITTING") {
        expect(PETITION_TRANSITIONS[s]).not.toContain("UNKNOWN");
        expect(PETITION_TRANSITIONS[s]).not.toContain("AWAITING_CONFIRMATION");
      }
    }
    expect(reach("DRAFT").has("FILED_CONFIRMED")).toBe(true); // existe caminho oficial
    // toda transição aponta para um estado conhecido
    for (const s of PETITION_STATUS_KEYS) for (const n of PETITION_TRANSITIONS[s]) expect(PETITION_STATUS_KEYS).toContain(n);
  });

  it("falha definitiva × dúvida", () => {
    expect(isDefiniteFailure(new ConflictError("recusou"), false)).toBe(true);
    expect(isDefiniteFailure(new ValidationError("x"), false)).toBe(true);
    expect(isDefiniteFailure(new Error("boom"), false)).toBe(false); // adaptador real com exceção inesperada: dúvida
    expect(isDefiniteFailure(new Error("boom"), true)).toBe(true); // demonstração: nada sai
  });

  it("reenvio: só de aprovada, ou de falha com recusa definitiva; dúvida bloqueia", () => {
    expect(canSubmitAgain({ status: "APPROVED", lastAttempt: null, error: null })).toEqual({ ok: true });
    expect(canSubmitAgain({ status: "FAILED", lastAttempt: "REJECTED", error: "recusado" })).toEqual({ ok: true });
    expect(canSubmitAgain({ status: "FAILED", lastAttempt: "ABORTED", error: null })).toEqual({ ok: true });
    expect(canSubmitAgain({ status: "FAILED", lastAttempt: null, error: null })).toEqual({ ok: true }); // legado sem tentativa registrada
    for (const lastAttempt of ["UNCERTAIN", "STARTED"] as const) expect(canSubmitAgain({ status: "FAILED", lastAttempt, error: null }).ok).toBe(false);
    expect(canSubmitAgain({ status: "FAILED", lastAttempt: null, error: "ATENÇÃO: não recebemos confirmação do tribunal e a petição PODE ter sido protocolada." }).ok).toBe(false); // legado em dúvida
    for (const status of ["UNKNOWN", "AWAITING_CONFIRMATION", "SUBMITTING", "SUBMITTED", "FILED_CONFIRMED", "DRAFT", "IN_REVIEW", "CANCELED"]) expect(canSubmitAgain({ status, lastAttempt: null, error: null }).ok).toBe(false);
    expect(isLegacyUncertain("ATENÇÃO: não recebemos confirmação do tribunal")).toBe(true);
    expect(isLegacyUncertain("outro erro")).toBe(false);
  });

  it("descrições em português simples: teste nunca aparece como protocolada", () => {
    expect(petitionStateInfo("FILED_CONFIRMED", "PRODUCTION")).toMatchObject({ officiallyFiled: true, label: "Protocolada com confirmação oficial" });
    for (const env of ["DEMO", "SIMULATED", "HOMOLOGATION"]) {
      const i = petitionStateInfo("SUBMITTED", env);
      expect(i.officiallyFiled).toBe(false);
      expect(i.testOnly).toBe(true);
      expect(i.label).not.toMatch(/Protocolada/);
    }
    expect(petitionStateInfo("SUBMITTED", null, true).testOnly).toBe(true);
    expect(petitionStateInfo("SUBMITTED", null).label).toMatch(/sem recibo oficial verificado/);
    expect(petitionStateInfo("UNKNOWN", null).needsReconciliation).toBe(true);
    expect(petitionStateInfo("AWAITING_CONFIRMATION", "PRODUCTION").needsReconciliation).toBe(true);
    expect(petitionStateInfo("AWAITING_CONFIRMATION", "PRODUCTION").officiallyFiled).toBe(false);
  });
});
