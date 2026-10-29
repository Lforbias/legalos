/** Flags históricas do Box. O módulo foi retirado em 29/10/2026; BOX_AVAILABLE=false prevalece sobre qualquer variável antiga. */
type Env = Record<string, string | undefined>;
import { BOX_AVAILABLE } from "./box-retirement";

const isOn = (v: string | undefined) => {
  const s = v?.trim().toLowerCase();
  return s === "1" || s === "true" || s === "on";
};

/** Ids de escritório liberados para o piloto (minúsculos, sem espaços). */
export function boxV2PilotOrgs(env: Env = process.env): string[] {
  return (env.LEGALOS_BOX_V2_ORGS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** O Box 2.0 está ligado para este escritório? Sem `orgId`, só a chave geral vale. */
export function boxV2Enabled(orgId?: string | null, env: Env = process.env): boolean {
  if (!BOX_AVAILABLE) return false;
  if (isOn(env.LEGALOS_BOX_V2)) return true;
  if (!orgId) return false;
  return boxV2PilotOrgs(env).includes(orgId.toLowerCase());
}

/** Há algum escritório com o Box 2.0 ligado (chave geral ou piloto)? Usado para responder 404 cedo quando tudo está desligado. */
export function boxV2EnabledAnywhere(env: Env = process.env): boolean {
  if (!BOX_AVAILABLE) return false;
  return isOn(env.LEGALOS_BOX_V2) || boxV2PilotOrgs(env).length > 0;
}
