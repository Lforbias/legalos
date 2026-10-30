/**
 * Sonda do MNI (SOAP/CNJ) contra um tribunal REAL — para rodar num computador com internet de verdade
 * (de preferência no Brasil), NUNCA dentro do ambiente de nuvem do LegalOS/Claude.
 *
 * Reaproveita o MESMO transporte e os MESMOS parsers que o LegalOS usa em produção
 * (src/lib/mni/transport.ts e src/lib/mni/xml.ts) — isto não é uma implementação paralela, é o
 * cliente MNI de verdade rodando isolado, para testar um tribunal antes de cadastrar a conexão no app.
 *
 * SEGURANÇA — leia antes de rodar:
 *   - O certificado A1 (.pfx) e as senhas ficam SÓ no computador onde você rodar este script.
 *     Nada disso é enviado para o Claude, para a nuvem do LegalOS, nem para qualquer lugar além do
 *     próprio tribunal (e só pelo canal HTTPS/mTLS oficial do serviço).
 *   - NÃO passe senha por "--password" ou "--pfx-password": linha de comando fica gravada no histórico
 *     do shell. Use as variáveis de ambiente MNI_PROBE_PASSWORD e MNI_PROBE_PFX_PASSWORD.
 *   - Por padrão a saída é segura para colar no chat: nunca imprime senha, certificado, número de
 *     processo, nome de parte ou texto de movimentação — só contagens, nomes de campos e o formato da
 *     resposta. Use --show-content para ver o conteúdo de verdade no SEU PRÓPRIO terminal (sem colar
 *     esse resultado em lugar nenhum).
 *
 * MODOS:
 *   --mode wsdl      (padrão) só verifica se o serviço responde e se o contrato tem as operações do MNI.
 *                    NÃO precisa de certificado nem senha — é o primeiro teste a fazer.
 *   --mode avisos     consulta os avisos (intimações/citações) pendentes do consultante. Precisa de
 *                     --cpf e (senha via MNI_PROBE_PASSWORD) e/ou (certificado via --pfx).
 *   --mode processo   consulta um processo específico (--cnj, 20 dígitos). Mesma autenticação do modo avisos.
 *
 * EXEMPLOS:
 *   # 1) Só testar se o endereço do TRF3 responde (sem credenciais):
 *   npx tsx scripts/mni-probe.ts --url https://pje1g.trf3.jus.br/pje/intercomunicacao --mode wsdl
 *
 *   # 2) Sem --url, tenta uma pequena lista de endereços PADRÃO do PJe (não confirmados oficialmente):
 *   npx tsx scripts/mni-probe.ts --mode wsdl
 *
 *   # 3) Consultar avisos pendentes (CPF + senha e/ou certificado):
 *   MNI_PROBE_PASSWORD=xxxx MNI_PROBE_PFX_PASSWORD=yyyy \
 *     npx tsx scripts/mni-probe.ts --url https://pje1g.trf3.jus.br/pje/intercomunicacao \
 *     --cpf 12345678900 --pfx /caminho/para/certificado.pfx --mode avisos
 *
 *   # 4) Consultar um processo específico:
 *   MNI_PROBE_PASSWORD=xxxx npx tsx scripts/mni-probe.ts --url ... --cpf ... --mode processo \
 *     --cnj 00008323520184036100
 *
 * O endereço do MNI do tribunal é sempre uma ADIVINHAÇÃO quando você não tem o endereço oficial
 * (--url). Prefira sempre o endereço informado pela Seção de TI / NUGEP do tribunal, ou publicado no
 * portal de interoperabilidade do CNJ.
 */
import fs from "node:fs";
import { fetchWsdl, postSoap, type Mtls } from "../src/lib/mni/transport";
import { buildConsultarAvisosPendentes, buildConsultarProcesso, parseAvisosPendentes, parseConsultarProcesso, MniError, type MniCredentials } from "../src/lib/mni/xml";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
};
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const fail = (msg: string): never => {
  console.error(msg);
  process.exit(1);
};

// Convenção comum do PJe de 1º grau — NÃO confirmados como endereço oficial do MNI do TRF3.
const CANDIDATE_URLS = ["https://pje1g.trf3.jus.br/pje/intercomunicacao", "https://pje2g.trf3.jus.br/pje/intercomunicacao"];

const mode = (arg("mode") ?? "wsdl").toLowerCase();
if (!["wsdl", "avisos", "processo"].includes(mode)) fail("Uso: --mode wsdl|avisos|processo (veja os comentários no topo do arquivo para exemplos).");

const explicitUrl = arg("url")?.trim();
const urls = explicitUrl ? [explicitUrl] : CANDIDATE_URLS;

const showContent = flag("show-content");
const cpfDigits = (arg("cpf") ?? "").replace(/\D/g, "");
if (arg("password")) console.error("AVISO: evite passar --password pela linha de comando (fica no histórico do shell); prefira a variável de ambiente MNI_PROBE_PASSWORD.");
const password = process.env.MNI_PROBE_PASSWORD ?? arg("password") ?? "";
if (arg("pfx-password")) console.error("AVISO: evite passar --pfx-password pela linha de comando; prefira a variável de ambiente MNI_PROBE_PFX_PASSWORD.");
const pfxPassword = process.env.MNI_PROBE_PFX_PASSWORD ?? arg("pfx-password") ?? "";
const pfxPath = arg("pfx")?.trim();

let mtls: Mtls | undefined;
if (pfxPath) {
  if (!fs.existsSync(pfxPath)) fail(`Certificado não encontrado neste computador: ${pfxPath}`);
  if (!pfxPassword) fail("Informe a senha do certificado na variável de ambiente MNI_PROBE_PFX_PASSWORD.");
  mtls = { pfx: fs.readFileSync(pfxPath), passphrase: pfxPassword };
}

if (mode !== "wsdl") {
  if (!cpfDigits || !/^\d{11,14}$/.test(cpfDigits)) fail("Informe --cpf com o CPF (ou CNPJ) do consultante, só dígitos, para os modos avisos/processo.");
  if (!password && !mtls) fail("Informe a senha (MNI_PROBE_PASSWORD) e/ou o certificado (--pfx) para os modos avisos/processo.");
}
const cnj = arg("cnj") ?? "";
if (mode === "processo" && !/^\d{20}$/.test(cnj)) fail("Informe --cnj com os 20 dígitos do número do processo (sem máscara/pontuação) para o modo processo.");

const creds: MniCredentials = { document: cpfDigits, password };

function chars(value: string | null | undefined): string {
  if (!value) return "(vazio)";
  return showContent ? value : `[${value.length} caractere(s)]`;
}

async function tryUrl(url: string): Promise<boolean> {
  console.log(`\n=== ${url} ===`);
  const t0 = Date.now();
  try {
    if (mode === "wsdl") {
      const xml = await fetchWsdl(url, mtls);
      const ms = Date.now() - t0;
      const ops = ["consultarProcesso", "consultarAvisosPendentes", "entregarManifestacaoProcessual"].filter((op) => xml.includes(op));
      console.log(`OK: o serviço respondeu em ${ms} ms (${xml.length} byte(s) de WSDL).`);
      console.log(`Operações do MNI encontradas no contrato: ${ops.length ? ops.join(", ") : "NENHUMA — pode não ser o endpoint do MNI, ou é outro contrato/versão."}`);
      return ops.length > 0;
    }
    if (mode === "avisos") {
      const xml = await postSoap(url, buildConsultarAvisosPendentes(creds), mtls);
      const ms = Date.now() - t0;
      const avisos = parseAvisosPendentes(xml);
      console.log(`OK: o tribunal aceitou a autenticação e respondeu em ${ms} ms.`);
      console.log(`Avisos pendentes: ${avisos.length}.`);
      if (avisos.length) {
        const tipos = new Map<string, number>();
        for (const a of avisos) tipos.set(a.tipo, (tipos.get(a.tipo) ?? 0) + 1);
        console.log(`Por tipo: ${JSON.stringify(Object.fromEntries(tipos))}.`);
        if (showContent) for (const a of avisos.slice(0, 20)) console.log(`  - ${a.tipo} | processo ${a.numeroProcesso ?? "?"} | disponibilizado em ${a.disponibilizadoEm?.toISOString() ?? "?"}`);
      }
      return true;
    }
    const xml = await postSoap(url, buildConsultarProcesso(creds, cnj), mtls);
    const ms = Date.now() - t0;
    const proc = parseConsultarProcesso(xml);
    console.log(`OK: o tribunal aceitou a autenticação e respondeu em ${ms} ms.`);
    console.log(`Classe: ${chars(proc.classe)} | órgão: ${chars(proc.orgao)} | movimentos: ${proc.movimentos.length} | documentos: ${proc.documentos.length}.`);
    if (showContent) {
      for (const m of proc.movimentos.slice(0, 20)) console.log(`  - ${m.at.toISOString()} | ${m.descricaoLocal ?? m.codigoNacional ?? "?"}`);
      for (const d of proc.documentos.slice(0, 20)) console.log(`  - documento ${d.id} | ${d.tipo ?? "?"} | ${d.mimetype ?? "?"}${d.content ? ` | ${d.content.length} byte(s)` : ""}`);
    }
    return true;
  } catch (e) {
    const ms = Date.now() - t0;
    console.error(`FALHOU em ${ms} ms: ${e instanceof MniError ? e.message : e instanceof Error ? e.message : "erro desconhecido"}`);
    if (e instanceof Error && /ENOTFOUND|EAI_AGAIN/.test((e as NodeJS.ErrnoException).code ?? "")) console.error("Dica: confira se este computador tem acesso real à internet e se o domínio está certo.");
    return false;
  }
}

async function main() {
  console.log(`Sonda MNI — modo: ${mode}.`);
  if (!explicitUrl) {
    console.log("Nenhum --url informado; tentando endereços PADRÃO do PJe (NÃO confirmados oficialmente para o TRF3):");
    for (const u of urls) console.log(`  - ${u}`);
    console.log("Se o tribunal já informou o endereço oficial do serviço MNI, rode de novo com --url <endereço>.\n");
  }
  let any = false;
  for (const url of urls) {
    any = (await tryUrl(url)) || any;
    if (urls.length > 1) await new Promise((r) => setTimeout(r, 500));
  }
  console.log("\n=== FIM (pode colar esta seção e as de cima no chat; nada sensível é impresso por padrão) ===");
  console.log(any ? "Pelo menos um endereço respondeu com sucesso." : "Nenhum endereço funcionou — veja as mensagens de erro acima.");
  process.exit(any ? 0 : 2);
}

main().catch((e) => {
  console.error("Falha inesperada na sonda:", e instanceof Error ? e.message : "erro desconhecido");
  process.exit(2);
});
