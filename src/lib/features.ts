/**
 * Chaves de funcionalidade do LegalOS (lidas do ambiente do servidor, sempre em tempo de execução).
 *
 * Box 2.0 (nova navegação, Conexões Judiciais, Operação e Saúde, assistente de configuração):
 *   LEGALOS_BOX_V2=1            liga para TODOS os escritórios (aceita 1, true ou on).
 *   LEGALOS_BOX_V2_ORGS=id1,id2 liga só para os escritórios listados (ids, separados por vírgula): serve para um piloto.
 * Desligada (padrão), o Box continua exatamente como era: nenhuma tela antiga muda e as novas respondem 404.
 * Reversão: remover as variáveis (ou colocar 0) e reiniciar o contêiner. Os dados novos permanecem no banco, sem uso.
 */
type Env = Record<string, string | undefined>;

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
  if (isOn(env.LEGALOS_BOX_V2)) return true;
  if (!orgId) return false;
  return boxV2PilotOrgs(env).includes(orgId.toLowerCase());
}

/** Há algum escritório com o Box 2.0 ligado (chave geral ou piloto)? Usado para responder 404 cedo quando tudo está desligado. */
export function boxV2EnabledAnywhere(env: Env = process.env): boolean {
  return isOn(env.LEGALOS_BOX_V2) || boxV2PilotOrgs(env).length > 0;
}
