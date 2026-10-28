import { TRF1_MNI_SOURCE, TRF1_MNI_TARGETS } from "./endpoint";
export const OFFICIAL_MNI_TARGETS = [
  ...TRF1_MNI_TARGETS.map(t => ({ ...t, key: `trf1-${t.key}`, jtr: "4.01", source: TRF1_MNI_SOURCE })),
  ...[1, 2].map(g => ({ key: `tjba-${g}`, label: `TJBA · Produção · ${g}º grau`, jtr: "8.05", environment: "PRODUCTION", endpointUrl: `https://pje${g}g-mni.tjba.jus.br/pje/intercomunicacao`, source: "https://www.tjba.jus.br/portal/web-service/" })),
  ...[1, 2].map(g => ({ key: `tjpe-${g}`, label: `TJPE · Produção · ${g}º grau`, jtr: "8.17", environment: "PRODUCTION", endpointUrl: `https://pjemni.app.tjpe.jus.br/${g}g/servico-intercomunicacao-2.2.2`, source: "https://portal.tjpe.jus.br/web/transparencia/tic/dados-abertos" })),
  ...[6, 15].flatMap(trt => ["primeirograu", "segundograu"].map((degree, i) => ({ key: `trt${trt}-${i + 1}`, label: `TRT${trt} · Produção · ${i + 1}º grau`, jtr: `5.${String(trt).padStart(2, "0")}`, environment: "PRODUCTION", endpointUrl: `https://pje.trt${trt}.jus.br/${degree}/servicosweb/mni222/intercomunicacao`, source: trt === 6 ? "https://www.trt6.jus.br/portal/transparencia/dados-abertos" : "https://trt15.jus.br/transparencia/dados-abertos" }))),
];
