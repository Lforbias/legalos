import { connectionSoapAction } from "@/lib/connectors/capabilities";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { isValidCnj, onlyDigits } from "@/lib/validation/br-documents";
import { jtrOfCnj } from "@/lib/mni/tribunals";

import { postSoap } from "@/lib/mni/transport";
import { buildEntregarManifestacao, MniError, parseEntregarManifestacao, type MniManifestDoc } from "@/lib/mni/xml";
import { SubmissionUncertainError, type PetitioningAdapter } from "@/lib/petitioning/adapter";
import { PETITION_TYPE_KEYS, type PetitionTypeKey } from "@/lib/petitioning/types";
import { db } from "@/lib/db/client";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { requireMfa } from "./certificate.service";
import { connectionForCase, assertConnectionOperation, loadConnection, mtlsFor, record, type SoapPost } from "./mni.service";

const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const CODE = /^[A-Za-z0-9._-]{1,20}$/;

/** Define os códigos de tipo de documento do tribunal para o protocolo. Só quem administra integrações; exige 2FA. */
export async function setPetitionTypes(ctx: TenantContext, connectionId: string, raw: Record<string, string>) {
  assertCan(ctx, "integrations:manage");
  await requireMfa(ctx.userId);
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!(PETITION_TYPE_KEYS as readonly string[]).includes(k)) throw new ValidationError(`Tipo desconhecido: ${k}.`);
    const code = (v ?? "").trim();
    if (!code) continue;
    if (!CODE.test(code)) throw new ValidationError("O código do tribunal deve ter de 1 a 20 caracteres (letras, números, ponto, hífen ou sublinhado).", { [k]: ["Código inválido."] });
    clean[k] = code;
  }
  const res = await db.courtConnection.updateMany({ where: { id: connectionId, organizationId: ctx.organizationId }, data: { petitionTypes: clean } });
  if (res.count !== 1) throw new NotFoundError("Conexão não encontrada.");
  await audit({ action: "mni.petition_types_set", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_connection", resourceId: connectionId, metadata: { keys: Object.keys(clean) }, meta: ctx.meta });
}

async function findConnection(ctx: TenantContext, caseNumber: string | null, caseId?: string) {
  if (!caseNumber || !isValidCnj(caseNumber)) throw new ConflictError("O processo precisa ter um número CNJ válido para protocolar no tribunal.");
  const jtr = jtrOfCnj(caseNumber);
  let conn;
  if (caseId) {
    const selected = await connectionForCase(ctx, caseId, "entregarManifestacaoProcessual");
    conn = selected ? await db.courtConnection.findFirst({ where: { id: selected.id, organizationId: ctx.organizationId }, select: { id: true, petitionTypes: true, label: true } }) : null;
  } else {
    const { assertConnectorFor } = await import("./court-system-map.service");
    await assertConnectorFor(ctx.organizationId, jtr, "petition");
    const candidates = jtr ? await db.courtConnection.findMany({ where: { organizationId: ctx.organizationId, jtr, enabled: true }, select: { id: true, petitionTypes: true, label: true } }) : [];
    if (candidates.length > 1) throw new ConflictError("Mais de uma conexão disponível; informe o processo para selecionar o sistema.");
    conn = candidates[0];
  }
  if (!conn) throw new ConflictError("Nenhuma conexão PJe/MNI ativa para o tribunal deste processo (cadastre em Integrações).");
  return conn;
}

const asTypes = (v: unknown): Partial<Record<PetitionTypeKey, string>> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {});

/**
 * Protocolo real pelo MNI. DESLIGADO por padrão (PETITIONING_ADAPTER=mni liga). Testado só contra tribunal SIMULADO:
 * antes do primeiro uso real, valide em homologação do tribunal (tipos de documento, assinatura e recibo variam).
 */
export const mniAdapter: PetitioningAdapter = {
  key: "mni",
  label: "Tribunais via MNI 2.2.2 (protocolo real)",
  isDemo: false,
  async preflight(input, env) {
    const ctx = env.ctx as TenantContext;
    await requireMfa(ctx.userId);
    const conn = await findConnection(ctx, input.caseNumber, env.caseId);
    const types = asTypes(conn.petitionTypes);
    if (!types.PETICAO) throw new ConflictError(`Configure em Integrações o código de tipo de documento da PETIÇÃO para a conexão "${conn.label}" (o tribunal informa os códigos).`);
    for (const a of input.attachments) {
      if (!(types as Record<string, string>)[a.classification]) throw new ConflictError(`Configure o código de tipo de documento "${a.classification}" na conexão "${conn.label}" ou troque a classificação do anexo "${a.fileName}".`);
    }
    const total = input.document.sizeBytes + input.attachments.reduce((n, a) => n + a.sizeBytes, 0);
    if (total > MAX_TOTAL_BYTES) throw new ConflictError("O conjunto de arquivos passa de 25 MB, acima do que enviamos de uma vez ao tribunal.");
  },
  async submit(input, env) {
    if (!env) throw new Error("Contexto de envio ausente.");
    const ctx = env.ctx as TenantContext;
    const post = (env.post as SoapPost | undefined) ?? postSoap;
    const conn = await findConnection(ctx, input.caseNumber, env.caseId);
    const types = asTypes(conn.petitionTypes) as Record<string, string>;
    const { c, secret } = await loadConnection(ctx, conn.id, { personal: true });
    assertConnectionOperation(c, "entregarManifestacaoProcessual");
    const cnj = onlyDigits(input.caseNumber ?? "");
    const docs: MniManifestDoc[] = [
      { tipoDocumento: types.PETICAO!, mimetype: input.document.mimeType, descricao: input.title.slice(0, 120), conteudo: env.files.main },
      ...input.attachments.map((a, i) => ({ tipoDocumento: types[a.classification]!, mimetype: a.mimeType, descricao: a.fileName.slice(0, 120), conteudo: env.files.attachments[i]! })),
    ];
    const mtls = await mtlsFor(ctx, c.certificateId, "mni:entregarManifestacaoProcessual", env.caseId);
    const xml = buildEntregarManifestacao(secret, cnj, docs, new Date());

    let response: string;
    try {
      response = await post(c.endpointUrl, xml, mtls, connectionSoapAction(c, "entregarManifestacaoProcessual"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const definite = /recusou o acesso|Falha de TLS/i.test(msg);
      await record(c.id, false, `Protocolo: ${msg}`);
      if (definite) throw new ConflictError(msg);
      throw new SubmissionUncertainError(msg);
    }
    try {
      const r = parseEntregarManifestacao(response);
      await record(c.id, true, `Petição protocolada (${r.protocolo}).`);
      await audit({ action: "mni.petition_delivered", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "petition", resourceId: input.petitionId, metadata: { connectionId: c.id, protocol: r.protocolo, documents: docs.length }, meta: ctx.meta });
      return { protocol: r.protocolo, receipt: [`Protocolo ${r.protocolo} (${c.label})`, r.dataOperacao ? `Data no tribunal: ${r.dataOperacao.toISOString()}` : null, `Documentos enviados: ${docs.length}`, r.recibo ? `\nRecibo do tribunal:\n${r.recibo}` : null].filter(Boolean).join("\n") };
    } catch (err) {
      if (!(err instanceof MniError)) throw err;
      await record(c.id, false, `Protocolo: ${err.message}`);
      if (/sem número de protocolo|formato inesperado|não é um XML/i.test(err.message)) throw new SubmissionUncertainError(err.message);
      throw new ConflictError(err.message);
    }
  },
};
