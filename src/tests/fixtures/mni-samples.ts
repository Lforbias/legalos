// Respostas SIMULADAS no formato do MNI 2.2.x (construídas para teste; tribunais reais podem variar).
export const soap = (inner: string) => `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${inner}</soap:Body></soap:Envelope>`;

export const avisosXml = (cnjDigits: string) =>
  soap(`<ns2:consultarAvisosPendentesResposta xmlns:ns2="http://www.cnj.jus.br/servico-intercomunicacao-2.2.2/"><sucesso>true</sucesso><mensagem>ok</mensagem>
  <aviso idAviso="900001" tipoComunicacao="INT" dataDisponibilizacao="20261016093000"><processo numero="${cnjDigits}" classeProcessual="7"/></aviso>
  <aviso idAviso="900002" tipoComunicacao="CIT" dataDisponibilizacao="20261016101500"><processo numero="${cnjDigits}" classeProcessual="7"/></aviso>
  </ns2:consultarAvisosPendentesResposta>`);

export const processoXml = (cnjDigits: string) =>
  soap(`<ns2:consultarProcessoResposta xmlns:ns2="http://www.cnj.jus.br/servico-intercomunicacao-2.2.2/"><sucesso>true</sucesso>
  <processo><dadosBasicos numero="${cnjDigits}" classeProcessual="7" codigoLocalidade="1" nivelSigilo="0" dataAjuizamento="20240301101010"><orgaoJulgador codigoOrgao="1" nomeOrgao="1ª Vara do Trabalho"/></dadosBasicos>
  <movimento identificadorMovimento="1" dataHora="20240302100000" nivelSigilo="0"><movimentoNacional codigoNacional="26"/><complemento>sorteio</complemento></movimento>
  <movimento identificadorMovimento="2" dataHora="20240305140000" nivelSigilo="0"><movimentoLocal codigoPaiNacional="193" descricao="Juntada de petição"/></movimento>
  </processo></ns2:consultarProcessoResposta>`);

export const faultXml = soap(`<soap:Fault><faultcode>soap:Server</faultcode><faultstring>Credenciais inválidas</faultstring></soap:Fault>`);
export const semSucessoXml = soap(`<ns2:consultarProcessoResposta xmlns:ns2="x"><sucesso>false</sucesso><mensagem>Processo não encontrado</mensagem></ns2:consultarProcessoResposta>`);

// ---- Autos (documentos) SIMULADOS ----
const pdf = (n: string) => Buffer.from(`%PDF-1.4\n% documento simulado ${n}\n%%EOF`).toString("base64");
export const AUTOS_DOCS = [
  { id: "7001", tipo: "Petição Inicial", descricao: "Petição inicial", mime: "application/pdf", sigilo: 0, content: pdf("7001"), vinculados: [{ id: "7006", tipo: "Documento de Identificação", descricao: "RG", mime: "application/pdf", sigilo: 0, content: pdf("7006") }] },
  { id: "7002", tipo: "Decisão", descricao: "Decisão inicial", mime: "application/pdf", sigilo: 0, content: pdf("7002") },
  { id: "7003", tipo: "Documento", descricao: "Laudo sigiloso", mime: "application/pdf", sigilo: 5, content: pdf("7003") },
  { id: "7004", tipo: "Despacho", descricao: "Despacho em HTML", mime: "text/html", sigilo: 0, content: Buffer.from("<html>x</html>").toString("base64") },
  { id: "7005", tipo: "Outros", descricao: "Falso PDF", mime: "application/pdf", sigilo: 0, content: Buffer.from("isto nao e pdf").toString("base64") },
];
type Doc = { id: string; tipo: string; descricao: string; mime: string; sigilo: number; content: string; vinculados?: Doc[] };
const docTag = (d: Doc, withContent: boolean): string =>
  `<documento idDocumento="${d.id}" tipoDocumento="${d.tipo}" descricao="${d.descricao}" mimetype="${d.mime}" nivelSigilo="${d.sigilo}" dataHora="20240310120000">${withContent ? `<conteudo>${d.content}</conteudo>` : ""}${(d.vinculados ?? []).map((v) => docTag(v, withContent).replace("<documento ", "<documentoVinculado ").replace(/<\/documento>$/, "</documentoVinculado>")).join("")}</documento>`;
const flat = (ds: Doc[]): Doc[] => ds.flatMap((d) => [d, ...flat(d.vinculados ?? [])]);
export const autosListXml = (cnjDigits: string) =>
  soap(`<ns2:consultarProcessoResposta xmlns:ns2="x"><sucesso>true</sucesso><processo><dadosBasicos numero="${cnjDigits}" classeProcessual="7" nivelSigilo="0"/>${AUTOS_DOCS.map((d) => docTag(d, false)).join("")}</processo></ns2:consultarProcessoResposta>`);
export const autosContentXml = (cnjDigits: string, ids: string[]) =>
  soap(`<ns2:consultarProcessoResposta xmlns:ns2="x"><sucesso>true</sucesso><processo><dadosBasicos numero="${cnjDigits}" classeProcessual="7" nivelSigilo="0"/>${(AUTOS_DOCS as Doc[]).filter((d) => ids.includes(d.id) || flat([d]).some((x) => ids.includes(x.id))).map((d) => docTag(d, true)).join("")}</processo></ns2:consultarProcessoResposta>`);
