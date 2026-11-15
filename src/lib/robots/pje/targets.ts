/**
 * Destinos do robô do PJe. O login do PJe é central (SSO do PDPJ): a pessoa tem UMA senha para todos os tribunais,
 * mas cada tribunal/grau é um "cliente" do SSO. Só entram aqui destinos cujo login real foi conferido
 * (a página de login redireciona para o SSO com o `client_id` indicado). Nunca aceitamos endereço digitado pela pessoa.
 */
export type PjeTarget = { key: string; label: string; origin: string; loginPath: string; clientId: string };

export const PJE_SSO_ORIGIN = "https://sso.cloud.pje.jus.br";

export const PJE_TARGETS: readonly PjeTarget[] = [
  { key: "trf1-1g", label: "TRF1 · 1º grau (Justiça Federal da 1ª Região)", origin: "https://pje1g.trf1.jus.br", loginPath: "/pje/login.seam", clientId: "pje-trf1-1g" },
  { key: "trf1-2g", label: "TRF1 · 2º grau (Justiça Federal da 1ª Região)", origin: "https://pje2g.trf1.jus.br", loginPath: "/pje/login.seam", clientId: "pje-trf1-2g" },
  { key: "trf3-1g", label: "TRF3 · 1º grau (Justiça Federal da 3ª Região)", origin: "https://pje1g.trf3.jus.br", loginPath: "/pje/login.seam", clientId: "pje-trf3-1g" },
  { key: "trf3-2g", label: "TRF3 · 2º grau (Justiça Federal da 3ª Região)", origin: "https://pje2g.trf3.jus.br", loginPath: "/pje/login.seam", clientId: "pje-trf3-2g" },
  { key: "tjmg-1g", label: "TJMG · 1º grau (PJe legado)", origin: "https://pje.tjmg.jus.br", loginPath: "/pje/login.seam", clientId: "pje-tjmg-1g" },
  { key: "tjes-1g", label: "TJES · 1º grau (Tribunal de Justiça do Espírito Santo)", origin: "https://pje.tjes.jus.br", loginPath: "/pje/login.seam", clientId: "pje-tjes-1g" },
  { key: "trt1-1g", label: "TRT1 · 1º grau", origin: "https://pje.trt1.jus.br", loginPath: "/primeirograu/login.seam", clientId: "pje-trt1-1g" },
  { key: "trt1-2g", label: "TRT1 · 2º grau", origin: "https://pje.trt1.jus.br", loginPath: "/segundograu/login.seam", clientId: "pje-trt1-2g" },
  { key: "trt2-1g", label: "TRT2 · 1º grau", origin: "https://pje.trt2.jus.br", loginPath: "/primeirograu/login.seam", clientId: "pje-trt2-1g" },
  { key: "trt2-2g", label: "TRT2 · 2º grau", origin: "https://pje.trt2.jus.br", loginPath: "/segundograu/login.seam", clientId: "pje-trt2-2g" },
  { key: "trt3-1g", label: "TRT3 · 1º grau", origin: "https://pje.trt3.jus.br", loginPath: "/primeirograu/login.seam", clientId: "pje-trt3-1g" },
  { key: "trt3-2g", label: "TRT3 · 2º grau", origin: "https://pje.trt3.jus.br", loginPath: "/segundograu/login.seam", clientId: "pje-trt3-2g" },
  { key: "trt4-1g", label: "TRT4 · 1º grau", origin: "https://pje.trt4.jus.br", loginPath: "/primeirograu/login.seam", clientId: "pje-trt4-1g" },
  { key: "trt4-2g", label: "TRT4 · 2º grau", origin: "https://pje.trt4.jus.br", loginPath: "/segundograu/login.seam", clientId: "pje-trt4-2g" },
  { key: "trt9-1g", label: "TRT9 · 1º grau", origin: "https://pje.trt9.jus.br", loginPath: "/primeirograu/login.seam", clientId: "pje-trt9-1g" },
  { key: "trt9-2g", label: "TRT9 · 2º grau", origin: "https://pje.trt9.jus.br", loginPath: "/segundograu/login.seam", clientId: "pje-trt9-2g" },
  { key: "trt12-1g", label: "TRT12 · 1º grau", origin: "https://pje.trt12.jus.br", loginPath: "/primeirograu/login.seam", clientId: "pje-trt12-1g" },
  { key: "trt12-2g", label: "TRT12 · 2º grau", origin: "https://pje.trt12.jus.br", loginPath: "/segundograu/login.seam", clientId: "pje-trt12-2g" },
  { key: "trt15-1g", label: "TRT15 · 1º grau", origin: "https://pje.trt15.jus.br", loginPath: "/primeirograu/login.seam", clientId: "pje-trt15-1g" },
  { key: "trt15-2g", label: "TRT15 · 2º grau", origin: "https://pje.trt15.jus.br", loginPath: "/segundograu/login.seam", clientId: "pje-trt15-2g" },
  { key: "trt17-1g", label: "TRT17 · 1º grau", origin: "https://pje.trt17.jus.br", loginPath: "/primeirograu/login.seam", clientId: "pje-trt17-1g" },
  { key: "trt17-2g", label: "TRT17 · 2º grau", origin: "https://pje.trt17.jus.br", loginPath: "/segundograu/login.seam", clientId: "pje-trt17-2g" },
];

export const getPjeTarget = (key: string): PjeTarget | null => PJE_TARGETS.find((t) => t.key === key) ?? null;
export const pjeLoginUrl = (t: PjeTarget) => `${t.origin}${t.loginPath}`;
