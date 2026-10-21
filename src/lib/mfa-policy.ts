/** O escritório exige 2FA, a pessoa é da equipe (não é cliente do portal) e ainda não ativou? Então só a tela de ativação é permitida. */
export function mfaBlockedFor(orgRequiresMfa: boolean, roleKey: string, hasMfa: boolean): boolean {
  return orgRequiresMfa && roleKey !== "CLIENT" && !hasMfa;
}
