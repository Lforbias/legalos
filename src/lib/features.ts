/** Flags históricas do Box. BOX_AVAILABLE=false prevalece sobre qualquer variável antiga em produção. */
type Env = Record<string, string | undefined>;
import { BOX_AVAILABLE } from "./box-retirement";

const isOn = (v: string | undefined) => {
  const s = v?.trim().toLowerCase();
  return s === "1" || s === "true" || s === "on";
};

/** Compatibilidade para verificações de pilotos históricos. */
export function boxV2PilotOrgs(env: Env = process.env): string[] {
  return (env.LEGALOS_BOX_V2_ORGS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function boxV2Enabled(orgId?: string | null, env: Env = process.env): boolean {
  if (!BOX_AVAILABLE) return false;
  if (isOn(env.LEGALOS_BOX_V2)) return true;
  if (!orgId) return false;
  return boxV2PilotOrgs(env).includes(orgId.toLowerCase());
}

export function boxV2EnabledAnywhere(env: Env = process.env): boolean {
  if (!BOX_AVAILABLE) return false;
  return isOn(env.LEGALOS_BOX_V2) || boxV2PilotOrgs(env).length > 0;
}
