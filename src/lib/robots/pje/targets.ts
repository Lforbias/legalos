/**
 * Destinos do robô do PJe. O login do PJe é central (SSO do PDPJ): a pessoa tem UMA senha para todos os tribunais,
 * mas cada tribunal/grau é um "cliente" do SSO. Só entram aqui destinos cujo login real foi conferido
 * (a página de login redireciona para o SSO com o `client_id` indicado). Nunca aceitamos endereço digitado pela pessoa.
 */
export type PjeTarget = { key: string; label: string; origin: string; clientId: string };

export const PJE_SSO_ORIGIN = "https://sso.cloud.pje.jus.br";

export const PJE_TARGETS: readonly PjeTarget[] = [
  { key: "trf1-1g", label: "TRF1 · 1º grau (Justiça Federal da 1ª Região)", origin: "https://pje1g.trf1.jus.br", clientId: "pje-trf1-1g" },
  { key: "trf1-2g", label: "TRF1 · 2º grau (Justiça Federal da 1ª Região)", origin: "https://pje2g.trf1.jus.br", clientId: "pje-trf1-2g" },
];

export const getPjeTarget = (key: string): PjeTarget | null => PJE_TARGETS.find((t) => t.key === key) ?? null;
export const pjeLoginUrl = (t: PjeTarget) => `${t.origin}/pje/login.seam`;
