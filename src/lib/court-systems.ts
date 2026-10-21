import { isValidCnpj, isValidCpf, onlyDigits } from "@/lib/validation/br-documents";

/**
 * 3.0-F6b — sistemas de tribunal conhecidos e o que cada um exige para acessar.
 * `connector: true` = o LegalOS já tem conector (hoje só o MNI do PJe, ainda sem validação em tribunal real);
 * os demais podem ter credencial guardada, mas ficam marcados como "sem conector" até a 3.0-F6.
 */
export type AuthMode = "PASSWORD" | "CERTIFICATE" | "PASSWORD_AND_CERTIFICATE";
export type CourtSystem = { key: string; label: string; authModes: AuthMode[]; connector: boolean; notes: string };

export const COURT_SYSTEMS: CourtSystem[] = [
  { key: "pje-mni", label: "PJe (MNI)", authModes: ["PASSWORD", "CERTIFICATE", "PASSWORD_AND_CERTIFICATE"], connector: true, notes: "Consulta e protocolo pelo Modelo Nacional de Interoperabilidade. Cada tribunal precisa ter habilitado o MNI." },
  { key: "eproc", label: "eproc", authModes: ["PASSWORD", "PASSWORD_AND_CERTIFICATE"], connector: false, notes: "Login com usuário e senha; alguns tribunais exigem também certificado." },
  { key: "esaj", label: "e-SAJ", authModes: ["CERTIFICATE", "PASSWORD_AND_CERTIFICATE"], connector: false, notes: "Peticionamento exige certificado digital." },
  { key: "projudi", label: "PROJUDI", authModes: ["PASSWORD", "PASSWORD_AND_CERTIFICATE"], connector: false, notes: "Login com usuário e senha." },
];

export const getCourtSystem = (key: string) => COURT_SYSTEMS.find((s) => s.key === key) ?? null;

export type CredentialInput = { system: string; authMode: string; document: string; password?: string | null; certificateId?: string | null };

/** Confere, sem acessar nenhum tribunal, se a credencial atende ao que o sistema exige. Devolve a lista de pendências (vazia = completa). */
export function checkRequirements(input: CredentialInput): string[] {
  const sys = getCourtSystem(input.system);
  if (!sys) return ["Sistema de tribunal desconhecido."];
  const missing: string[] = [];
  if (!sys.authModes.includes(input.authMode as AuthMode)) missing.push(`${sys.label} não aceita este modo de acesso.`);
  const d = onlyDigits(input.document);
  if (!(d.length === 11 ? isValidCpf(d) : d.length === 14 ? isValidCnpj(d) : false)) missing.push("CPF/CNPJ inválido.");
  const needsPassword = input.authMode !== "CERTIFICATE";
  const needsCert = input.authMode !== "PASSWORD";
  if (needsPassword && !input.password) missing.push("Falta a senha.");
  if (needsCert && !input.certificateId) missing.push("Falta escolher o certificado do cofre.");
  return missing;
}
