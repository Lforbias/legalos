/**
 * Política de uso de certificado digital (Box 2.0). CONSULTAR e ASSINAR/PROTOCOLAR são poderes independentes:
 *  - consultar: leitura nos tribunais (avisos pendentes, processo, autos). Quem pode usar o certificado para isso: titular, autorizado ou quem administra o cofre.
 *  - assinar/protocolar: só com o certificado LIBERADO para isso (ato explícito e registrado), com a permissão de perfil "certificates:sign"
 *    e sendo titular ou autorizado COM poder de assinar.
 *  - ciência de intimação e qualquer finalidade desconhecida: nunca. O LegalOS não registra ciência oficial por conta própria.
 * Função pura: o servidor reúne os fatos e aplica a decisão num ponto único (`certificate.service`).
 */
export const READ_ONLY_PURPOSES: ReadonlySet<string> = new Set(["local:tls-check", "mni:wsdl", "mni:consultarAvisosPendentes", "mni:consultarProcesso", "mni:consultarProcesso:autos"]);
export const SIGN_PURPOSES: ReadonlySet<string> = new Set(["mni:entregarManifestacaoProcessual"]);

export type PurposeClass = "READ" | "SIGN" | "FORBIDDEN";
export const classifyPurpose = (purpose: string): PurposeClass => (READ_ONLY_PURPOSES.has(purpose) ? "READ" : SIGN_PURPOSES.has(purpose) ? "SIGN" : "FORBIDDEN");

export type CertificateUseDecision =
  | { allowed: true }
  | { allowed: false; code: "CONSULTATION_ONLY" | "FORBIDDEN_PURPOSE" | "NO_SIGN_PERMISSION" | "NOT_A_SIGNER"; message: string };

export function decideCertificateUse(i: {
  purpose: string;
  consultationOnly: boolean;
  isOwner: boolean;
  /** Linha de autorização desta pessoa: `null` = não há; senão se ela tem poder de assinar. */
  authorizedCanSign: boolean | null;
  hasSignPermission: boolean;
}): CertificateUseDecision {
  const cls = classifyPurpose(i.purpose);
  if (cls === "READ") return { allowed: true };
  if (i.consultationOnly) {
    return { allowed: false, code: "CONSULTATION_ONLY", message: "Este certificado é somente para consulta. Protocolo, assinatura, ciência de intimações e outras operações não autorizadas estão bloqueados." };
  }
  if (cls === "FORBIDDEN") {
    return { allowed: false, code: "FORBIDDEN_PURPOSE", message: "Esta finalidade não é permitida: o LegalOS não registra ciência de intimações nem faz operações fora das consultas e do protocolo liberado." };
  }
  if (!i.hasSignPermission) {
    return { allowed: false, code: "NO_SIGN_PERMISSION", message: "Seu perfil não tem permissão para assinar e protocolar com certificado digital. Peça a quem administra o escritório." };
  }
  if (!i.isOwner && i.authorizedCanSign !== true) {
    return { allowed: false, code: "NOT_A_SIGNER", message: "Você pode consultar com este certificado, mas não foi autorizado a assinar ou protocolar com ele." };
  }
  return { allowed: true };
}

export type SigningState = "CONSULTATION_ONLY" | "RELEASED" | "LEGACY_RELEASED";
export const SIGNING_STATE_LABEL: Record<SigningState, string> = {
  CONSULTATION_ONLY: "Somente consulta",
  RELEASED: "Liberado para assinatura e protocolo",
  LEGACY_RELEASED: "Cadastrado antes da trava — liberado para assinatura e protocolo",
};
/** `LEGACY_RELEASED`: certificado antigo (sem trava) que nunca passou pela liberação explícita; a tela pede para revisar. */
export function signingStateOf(c: { consultationOnly: boolean; signingEnabledAt: Date | null }): SigningState {
  if (c.consultationOnly) return "CONSULTATION_ONLY";
  return c.signingEnabledAt ? "RELEASED" : "LEGACY_RELEASED";
}
