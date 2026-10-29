import { describe, expect, it } from "vitest";
import { classifyPurpose, decideCertificateUse, signingStateOf } from "@/lib/judicial/certificate-policy";

const base = { consultationOnly: false, isOwner: true, authorizedCanSign: null, hasSignPermission: true } as const;
const SIGN = "mni:entregarManifestacaoProcessual";

describe("política de certificado: consultar × assinar", () => {
  it("classifica as finalidades", () => {
    for (const p of ["mni:wsdl", "mni:consultarAvisosPendentes", "mni:consultarProcesso", "mni:consultarProcesso:autos", "local:tls-check"]) expect(classifyPurpose(p)).toBe("READ");
    expect(classifyPurpose(SIGN)).toBe("SIGN");
    for (const p of ["assinar", "mni:consultarTeorComunicacao", "", "qualquer:outra"]) expect(classifyPurpose(p)).toBe("FORBIDDEN");
  });

  it("consulta é liberada em qualquer certificado, mesmo sem poder de assinar", () => {
    for (const consultationOnly of [true, false]) {
      expect(decideCertificateUse({ purpose: "mni:consultarProcesso", consultationOnly, isOwner: false, authorizedCanSign: false, hasSignPermission: false })).toEqual({ allowed: true });
    }
  });

  it("certificado em somente consulta bloqueia assinar e qualquer outra finalidade, mesmo para o titular com todas as permissões", () => {
    for (const purpose of [SIGN, "assinar", "mni:consultarTeorComunicacao"]) {
      const d = decideCertificateUse({ ...base, consultationOnly: true, purpose });
      expect(d).toMatchObject({ allowed: false, code: "CONSULTATION_ONLY" });
      expect((d as { message: string }).message).toMatch(/somente para consulta/);
    }
  });

  it("liberado: ciência e finalidade desconhecida continuam proibidas", () => {
    for (const purpose of ["mni:consultarTeorComunicacao", "assinar", "ciencia"]) expect(decideCertificateUse({ ...base, purpose })).toMatchObject({ allowed: false, code: "FORBIDDEN_PURPOSE" });
  });

  it("liberado: assinar exige permissão de perfil E ser titular ou autorizado com poder de assinar", () => {
    expect(decideCertificateUse({ ...base, purpose: SIGN })).toEqual({ allowed: true });
    expect(decideCertificateUse({ ...base, purpose: SIGN, hasSignPermission: false })).toMatchObject({ allowed: false, code: "NO_SIGN_PERMISSION" });
    // quem só administra o cofre (não é titular nem autorizado) consulta, mas não assina
    expect(decideCertificateUse({ ...base, purpose: SIGN, isOwner: false })).toMatchObject({ allowed: false, code: "NOT_A_SIGNER" });
    expect(decideCertificateUse({ ...base, purpose: SIGN, isOwner: false, authorizedCanSign: false })).toMatchObject({ allowed: false, code: "NOT_A_SIGNER" });
    expect(decideCertificateUse({ ...base, purpose: SIGN, isOwner: false, authorizedCanSign: true })).toEqual({ allowed: true });
  });

  it("estado de assinatura do certificado", () => {
    expect(signingStateOf({ consultationOnly: true, signingEnabledAt: null })).toBe("CONSULTATION_ONLY");
    expect(signingStateOf({ consultationOnly: false, signingEnabledAt: new Date() })).toBe("RELEASED");
    expect(signingStateOf({ consultationOnly: false, signingEnabledAt: null })).toBe("LEGACY_RELEASED");
  });
});
