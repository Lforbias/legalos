export type EprocPortalTarget = {
  key: string;
  courtCode: string;
  degree: "1" | "2";
  label: string;
  loginUrl: string;
  ssoOrigin?: string;
  source: string;
};

/** Endereços fixos de portais oficiais; nunca são aceitos como URLs enviados pelo usuário. */
export const EPROC_PORTAL_TARGETS: readonly EprocPortalTarget[] = [
  { key: "tjmg-1g", courtCode: "TJMG", degree: "1", label: "TJMG · 1º grau (eproc)", loginUrl: "https://eproc1g.tjmg.jus.br/eproc/", source: "https://www.tjmg.jus.br" },
  { key: "tjrs-1g", courtCode: "TJRS", degree: "1", label: "TJRS · 1º grau (eproc)", loginUrl: "https://eproc1g.tjrs.jus.br/eproc/", source: "https://www.tjrs.jus.br" },
  { key: "tjrs-2g", courtCode: "TJRS", degree: "2", label: "TJRS · 2º grau (eproc)", loginUrl: "https://eproc2g.tjrs.jus.br/eproc/", source: "https://www.tjrs.jus.br" },
  { key: "tjsc-1g", courtCode: "TJSC", degree: "1", label: "TJSC · 1º grau (eproc)", loginUrl: "https://eproc1g.tjsc.jus.br/eproc/", ssoOrigin: "https://sso.tjsc.jus.br", source: "https://www.tjsc.jus.br/web/processo-eletronico-eproc" },
  { key: "tjsc-2g", courtCode: "TJSC", degree: "2", label: "TJSC · 2º grau (eproc)", loginUrl: "https://eproc2g.tjsc.jus.br/eproc/", ssoOrigin: "https://sso.tjsc.jus.br", source: "https://www.tjsc.jus.br/web/processo-eletronico-eproc" },
  { key: "tjsp-1g", courtCode: "TJSP", degree: "1", label: "TJSP · 1º grau (eproc)", loginUrl: "https://eproc1g.tjsp.jus.br/eproc/", ssoOrigin: "https://sso.tjsp.jus.br", source: "https://www.tjsp.jus.br/eproc" },
  { key: "tjsp-2g", courtCode: "TJSP", degree: "2", label: "TJSP · 2º grau (eproc)", loginUrl: "https://eproc2g.tjsp.jus.br/eproc/", ssoOrigin: "https://sso.tjsp.jus.br", source: "https://www.tjsp.jus.br/eproc" },
  { key: "tjrj-1g", courtCode: "TJRJ", degree: "1", label: "TJRJ · 1º grau (eproc)", loginUrl: "https://eproc1g.tjrj.jus.br/eproc/", source: "https://www.tjrj.jus.br/processo-eletronico/apresentacao" },
  { key: "tjrj-2g", courtCode: "TJRJ", degree: "2", label: "TJRJ · 2º grau (eproc)", loginUrl: "https://eproc2g.tjrj.jus.br/eproc/", source: "https://www.tjrj.jus.br/processo-eletronico/apresentacao" },
  { key: "trf2-rj-1g", courtCode: "TRF2", degree: "1", label: "TRF2 · RJ · 1º grau (eproc)", loginUrl: "https://eproc.jfrj.jus.br/eproc/", source: "https://www.trf2.jus.br" },
  { key: "trf2-es-1g", courtCode: "TRF2", degree: "1", label: "TRF2 · ES · 1º grau (eproc)", loginUrl: "https://eproc.jfes.jus.br/eproc/", source: "https://www.trf2.jus.br" },
  { key: "trf2-2g", courtCode: "TRF2", degree: "2", label: "TRF2 · 2º grau (eproc)", loginUrl: "https://eproc.trf2.jus.br/eproc/", source: "https://portaleproc.trf2.jus.br" },
  { key: "trf4-rs-1g", courtCode: "TRF4", degree: "1", label: "TRF4 · RS · 1º grau (eproc)", loginUrl: "https://eproc.jfrs.jus.br/eproc/", source: "https://www.trf4.jus.br" },
  { key: "trf4-pr-1g", courtCode: "TRF4", degree: "1", label: "TRF4 · PR · 1º grau (eproc)", loginUrl: "https://eproc.jfpr.jus.br/eproc/", source: "https://www.trf4.jus.br" },
  { key: "trf4-sc-1g", courtCode: "TRF4", degree: "1", label: "TRF4 · SC · 1º grau (eproc)", loginUrl: "https://eproc.jfsc.jus.br/eproc/", source: "https://www.trf4.jus.br" },
  { key: "trf4-2g", courtCode: "TRF4", degree: "2", label: "TRF4 · 2º grau (eproc)", loginUrl: "https://eproc.trf4.jus.br/eproc/", source: "https://www.trf4.jus.br" },
  { key: "trf6-1g", courtCode: "TRF6", degree: "1", label: "TRF6 · 1º grau (eproc)", loginUrl: "https://eproc1g.trf6.jus.br/eproc/", source: "https://portal.trf6.jus.br/e-proc/" },
  { key: "trf6-2g", courtCode: "TRF6", degree: "2", label: "TRF6 · 2º grau (eproc)", loginUrl: "https://eproc2g.trf6.jus.br/eproc/", source: "https://portal.trf6.jus.br/e-proc/" },
];

export const getEprocPortalTarget = (key: string) => EPROC_PORTAL_TARGETS.find((target) => target.key === key) ?? null;
