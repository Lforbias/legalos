import { assertBoxAvailable } from "@/server/box-guard";
import { mniEndpointProblem } from "@/lib/connectors/endpoint";
import { tjprDailyPassword } from "@/lib/connectors/auth";
import { connectionSoapAction, connectionSupports, CONNECTION_ENVIRONMENTS, type MniOperation } from "@/lib/connectors/capabilities";
import { inspectMniContract } from "@/lib/connectors/contract";
import { getCourtSystem } from "@/lib/court-systems";
import { db } from "@/lib/db/client";
import { dateToYmd } from "@/lib/dates/ymd";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { certKey, openBytes, sealBytes, pfxForTls } from "@/lib/security/pfx";
import { isValidCnj, isValidCpf, isValidCnpj, onlyDigits } from "@/lib/validation/br-documents";
import { isKnownJtr, jtrOfCnj } from "@/lib/mni/tribunals";
import { systemForJtr } from "./court-system-map.service";
import { postSoap, fetchWsdl, assertEndpointUrl, type Mtls } from "@/lib/mni/transport";
import { buildConsultarAvisosPendentes, buildConsultarProcesso, MniError, parseAvisosPendentes, parseConsultarProcesso, type MniAviso, type MniDocumento, type MniProcesso } from "@/lib/mni/xml";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { assertCaseVisible } from "./case.service";
import { requireMfa, getCertificateMaterial } from "./certificate.service";
import { resolveMyCredential } from "./court-credential.service";
import { isUniqueViolation } from "./db-errors";
import { createNotice } from "./notice.service";
import { connectorKeyForMniSystem } from "@/lib/judicial/catalog";
import type { EvidenceEnvironment, OperationFailure } from "@/lib/judicial/contracts";
import { isLocalOrFakeUrl } from "@/lib/judicial/evidence";
import { recordEvidence } from "@/server/judicial/evidence.service";
import { classifyFile, MAX_DOCUMENT_BYTES, sanitizeFileName, storeNewDocument } from "./document.service";
import { resolveTenantContext } from "./tenant.service";

export const AUTH_MODES = ["PASSWORD", "CERTIFICATE", "PASSWORD_AND_CERTIFICATE"] as const;
export type AuthMode = (typeof AUTH_MODES)[number];

/** Transporte injetável (testes usam um servidor local; produção usa HTTPS real). */
export type SoapPost = (endpoint: string, xml: string, mtls?: Mtls, soapAction?: string) => Promise<string>;

function requireKey(): Buffer {
  const k = certKey();
  if (!k) throw new ConflictError("O cofre não está configurado neste sistema (falta CERT_ENCRYPTION_KEY).");
  return k;
}

const digitsToCnj = (d: string): string | null => {
  const x = onlyDigits(d);
  if (x.length !== 20) return null;
  const f = `${x.slice(0, 7)}-${x.slice(7, 9)}.${x.slice(9, 13)}.${x.slice(13, 14)}.${x.slice(14, 16)}.${x.slice(16, 20)}`;
  return isValidCnj(f) ? f : null;
};

export type ConnectionRow = { wsdlUrl: string | null; authProfile: string; system: string; environment: string; wsdlStatus: string | null; wsdlCheckedAt: Date | null; wsdlOperations: string[]; id: string; label: string; jtr: string; endpointUrl: string; authMode: string; certificateId: string | null; certificateLabel: string | null; enabled: boolean; lastSyncAt: Date | null; lastStatus: string | null; lastMessage: string | null; petitionTypes: Record<string, string> };

export async function listConnections(ctx: TenantContext): Promise<ConnectionRow[]> {
  assertBoxAvailable();
  assertCan(ctx, "integrations:manage");
  const rows = await db.courtConnection.findMany({ where: { organizationId: ctx.organizationId }, include: { certificate: { select: { label: true } } }, orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({ wsdlUrl: r.wsdlUrl, authProfile: r.authProfile, system: r.system, environment: r.environment, wsdlStatus: r.wsdlStatus, wsdlCheckedAt: r.wsdlCheckedAt, wsdlOperations: r.wsdlOperations, id: r.id, label: r.label, jtr: r.jtr, endpointUrl: r.endpointUrl, authMode: r.authMode, certificateId: r.certificateId, certificateLabel: r.certificate?.label ?? null, enabled: r.enabled, lastSyncAt: r.lastSyncAt, lastStatus: r.lastStatus, lastMessage: r.lastMessage, petitionTypes: (r.petitionTypes && typeof r.petitionTypes === "object" && !Array.isArray(r.petitionTypes) ? (r.petitionTypes as Record<string, string>) : {}) }));
}

export type ConnectionInput = { enabled?: boolean; wsdlUrl?: string; authProfile?: string; system?: string; environment?: string; label: string; jtr: string; endpointUrl: string; authMode: AuthMode; certificateId?: string | null; document: string; password?: string };

export async function createConnection(ctx: TenantContext, input: ConnectionInput) {
  assertBoxAvailable();
  assertCan(ctx, "integrations:manage");
  const key = requireKey();
  await requireMfa(ctx.userId);
  const system = input.system ?? "pje-mni";
  const environment = input.environment ?? "UNSPECIFIED";
  const authProfile = input.authProfile ?? "STATIC";
  if (!["STATIC", "TJPR_SCMPP"].includes(authProfile) || (authProfile === "TJPR_SCMPP" && (system !== "projudi" || input.jtr !== "8.16" || input.authMode !== "PASSWORD"))) throw new ValidationError("O perfil SCMPP só atende PROJUDI/TJPR com usuário e código privado da integração.");
  if (!getCourtSystem(system)) throw new ValidationError("Sistema de tribunal inválido.");
  if (!(CONNECTION_ENVIRONMENTS as readonly string[]).includes(environment)) throw new ValidationError("Ambiente inválido.");
  const label = input.label.trim();
  if (!label || label.length > 120) throw new ValidationError("Informe um nome de até 120 caracteres.", { label: ["Nome obrigatório."] });
  if (!isKnownJtr(input.jtr)) throw new ValidationError("Tribunal inválido.", { jtr: ["Selecione um tribunal da lista."] });
  if (!AUTH_MODES.includes(input.authMode)) throw new ValidationError("Modo de autenticação inválido.");
  try {
    const endpoint = assertEndpointUrl(input.endpointUrl);
    const problem = mniEndpointProblem(input.endpointUrl);
    if (problem) throw new MniError(problem);
    if (input.wsdlUrl?.trim()) {
      const contract = assertEndpointUrl(input.wsdlUrl.trim());
      const problem = mniEndpointProblem(input.wsdlUrl.trim());
      if (problem) throw new MniError(problem);
      if (endpoint.origin !== contract.origin) throw new MniError("O WSDL deve estar na mesma origem HTTPS do serviço do tribunal.");
    }
  } catch (e) {
    throw new ValidationError((e as Error).message, { endpointUrl: [(e as Error).message] });
  }
  const doc = system === "pje-mni" ? onlyDigits(input.document) : input.document.trim();
  if (system === "pje-mni" ? !(doc.length === 11 ? isValidCpf(doc) : doc.length === 14 ? isValidCnpj(doc) : false) : !/^[A-Za-z0-9_.@-]{1,120}$/.test(doc)) throw new ValidationError("CPF/CNPJ do consultante inválido.", { document: ["CPF/CNPJ inválido."] });
  const needsPassword = input.authMode !== "CERTIFICATE";
  const needsCert = input.authMode !== "PASSWORD";
  if (needsPassword && !input.password) throw new ValidationError("Informe a senha do serviço do tribunal.", { password: ["Senha obrigatória neste modo."] });
  let certificateId: string | null = null;
  if (needsCert) {
    const certInputId = input.certificateId ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(certInputId)) throw new ValidationError("Selecione um certificado válido do cofre.", { certificateId: ["Certificado obrigatório neste modo."] });
    const cert = await db.certificate.findFirst({ where: { id: certInputId, organizationId: ctx.organizationId, revokedAt: null, notAfter: { gt: new Date() } }, select: { id: true } });
    if (!cert) throw new ValidationError("Selecione um certificado válido do cofre.", { certificateId: ["Certificado inválido."] });
    certificateId = cert.id;
  }
  const secretEnc = sealBytes(Buffer.from(JSON.stringify({ document: doc, password: needsPassword ? input.password : "" }), "utf8"), key);
  const c = await db.courtConnection.create({ data: { organizationId: ctx.organizationId, wsdlUrl: input.wsdlUrl?.trim() || null, authProfile, system, environment, enabled: input.enabled ?? (system === "pje-mni"), label, jtr: input.jtr, endpointUrl: input.endpointUrl.trim(), authMode: input.authMode, certificateId, secretEnc, createdById: ctx.userId }, select: { id: true } });
  await audit({ action: "mni.connection_create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_connection", resourceId: c.id, metadata: { jtr: input.jtr, authMode: input.authMode }, meta: ctx.meta });
  return c;
}

export async function setConnectionEnabled(ctx: TenantContext, id: string, enabled: boolean) {
  assertBoxAvailable();
  assertCan(ctx, "integrations:manage");
  if (enabled) {
    const c = await db.courtConnection.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!c) throw new NotFoundError("Conexão não encontrada.");
    if (c.system !== "pje-mni" && c.wsdlStatus !== "COMPATIBLE") throw new ConflictError("Verifique o contrato WSDL desta conexão antes de ligá-la.");
  }
  const r = await db.courtConnection.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { enabled } });
  if (r.count !== 1) throw new NotFoundError("Conexão não encontrada.");
  await audit({ action: enabled ? "mni.connection_enable" : "mni.connection_disable", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_connection", resourceId: id, meta: ctx.meta });
}

/** Retarget without deleting credentials; always reset verification and restrict its certificate. */
export async function updateConnectionTarget(ctx: TenantContext, id: string, input: { endpointUrl: string; wsdlUrl?: string; environment: string; jtr: string }) {
  assertBoxAvailable();
  assertCan(ctx, "integrations:manage"); await requireMfa(ctx.userId);
  if (!isKnownJtr(input.jtr) || !(CONNECTION_ENVIRONMENTS as readonly string[]).includes(input.environment)) throw new ValidationError("Confira o tribunal e o ambiente.");
  const endpointUrl = input.endpointUrl.trim(); const wsdlUrl = input.wsdlUrl?.trim() || null;
  try {
    const endpoint = assertEndpointUrl(endpointUrl);
    const problem = mniEndpointProblem(endpointUrl) ?? (wsdlUrl ? mniEndpointProblem(wsdlUrl) : null);
    if (problem) throw new MniError(problem);
    if (wsdlUrl && assertEndpointUrl(wsdlUrl).origin !== endpoint.origin) throw new MniError("O WSDL deve estar na mesma origem do serviço do tribunal.");
  } catch (error) { throw new ValidationError((error as Error).message); }
  await db.$transaction(async tx => {
    const c = await tx.courtConnection.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!c) throw new NotFoundError("Conexão não encontrada.");
    if (c.authProfile === "TJPR_SCMPP" && input.jtr !== "8.16") throw new ValidationError("O perfil SCMPP só atende o TJPR. Cadastre uma conexão com o perfil correto para outro tribunal.");
    await tx.courtConnection.update({ where: { id }, data: { endpointUrl, wsdlUrl, environment: input.environment, jtr: input.jtr, enabled: false, wsdlStatus: null, wsdlCheckedAt: null, wsdlOperations: [], wsdlActions: {}, lastStatus: "PENDING", lastMessage: "Destino alterado. Verifique o contrato e a autorização do tribunal antes de ligar a conexão." } });
    if (c.certificateId) await tx.certificate.updateMany({ where: { id: c.certificateId, organizationId: ctx.organizationId }, data: { consultationOnly: true } });
    await audit({ action: "court_connection.target_update", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_connection", resourceId: id, metadata: { environment: input.environment, jtr: input.jtr, consultationOnly: true }, meta: ctx.meta }, tx);
  });
}

/** Remove a conexão e a senha cifrada (irreversível). */
export async function deleteConnection(ctx: TenantContext, id: string) {
  assertBoxAvailable();
  assertCan(ctx, "integrations:manage");
  await requireMfa(ctx.userId);
  const r = await db.courtConnection.deleteMany({ where: { id, organizationId: ctx.organizationId } });
  if (r.count !== 1) throw new NotFoundError("Conexão não encontrada.");
  await audit({ action: "mni.connection_delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_connection", resourceId: id, meta: ctx.meta });
}

/**
 * `personal: true` (ações de uma pessoa: consulta, autos, protocolo) usa a credencial pessoal dela para este tribunal, se existir
 * (3.0-F6b); sem ela, ou em rotinas automáticas, vale a credencial da conexão do escritório.
 */
export async function loadConnection(ctx: TenantContext, id: string, opts: { personal?: boolean; allowDisabled?: boolean } = {}) {
  assertBoxAvailable();
  const c = await db.courtConnection.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!c) throw new NotFoundError("Conexão não encontrada.");
  const problem = mniEndpointProblem(c.endpointUrl) ?? (c.wsdlUrl ? mniEndpointProblem(c.wsdlUrl) : null);
  if (problem) throw new ValidationError(problem, { endpointUrl: [problem] });
  if (!c.enabled && !opts.allowDisabled) throw new ConflictError("Esta conexão está desligada.");
  const key = requireKey();
  const secret = JSON.parse(openBytes(c.secretEnc, key).toString("utf8")) as { document: string; password: string };
  if (c.authProfile === "TJPR_SCMPP") secret.password = tjprDailyPassword(secret.password);
  if (opts.personal && c.authProfile === "STATIC") {
    const mine = await resolveMyCredential(ctx, c.system, c.jtr);
    if (mine) return { c: { ...c, authMode: mine.authMode, certificateId: mine.certificateId }, secret: mine.secret, personal: true as const };
  }
  return { c, secret, personal: false as const };
}

export async function mtlsFor(ctx: TenantContext, certificateId: string | null, purpose: string, caseId?: string): Promise<Mtls | undefined> {
  assertBoxAvailable();
  if (!certificateId) return undefined;
  const m = await getCertificateMaterial(ctx, certificateId, purpose, caseId ?? null);
  return { pfx: pfxForTls(m.pfx, m.passphrase), passphrase: m.passphrase };
}

export async function record(connectionId: string, ok: boolean, message: string) {
  assertBoxAvailable();
  await db.courtConnection.update({ where: { id: connectionId }, data: { lastSyncAt: new Date(), lastStatus: ok ? "OK" : "ERROR", lastMessage: message.slice(0, 300) } });
}

const brDate = (d: Date) => dateToYmd(new Date(d.getTime() - 3 * 3600 * 1000));

/** Ambiente da evidência: transporte injetado (testes) é SIMULADO; conexão em homologação é HOMOLOGAÇÃO; o resto é produção real. */
export const evidenceEnv = (c: { environment: string; endpointUrl: string }, post: SoapPost): EvidenceEnvironment => {
  if (post !== postSoap || isLocalOrFakeUrl(c.endpointUrl)) return "SIMULATED"; // servidor local/fictício nunca prova um tribunal real
  return c.environment === "HOMOLOGATION" ? "HOMOLOGATION" : "PRODUCTION";
};

/** O MNI não devolve código estruturado: classifica a falha pelo que o tribunal respondeu (conservador; na dúvida, formato inesperado). */
export function mniFailureCode(message: string): OperationFailure["code"] {
  if (/certificado|autentic|senha|credenci|login|acesso negado|permiss|n[ãa]o autorizad|unauthorized/i.test(message)) return "AUTH_REJECTED";
  if (/tempo|timeout|expirou/i.test(message)) return "TIMEOUT";
  if (/comunica[çc][ãa]o com|conex|rede|indispon|inst[áa]vel|recusou a conex/i.test(message)) return "UNAVAILABLE";
  return "INVALID_RESPONSE";
}

async function mniEvidence(ctx: TenantContext, c: { id: string; system: string; jtr: string; label: string }, operation: "listNotices" | "getCase" | "listDocuments", r: { ok: true } | OperationFailure, environment: EvidenceEnvironment, details: Record<string, unknown> = {}) {
  const connectorKey = connectorKeyForMniSystem(c.system);
  if (!connectorKey) return;
  try {
    await recordEvidence({ organizationId: ctx.organizationId, source: { kind: "MNI", id: c.id }, connectorKey, courtCode: c.jtr, operation, accessMethod: "MNI", environment, outcome: r.ok ? "PASSED" : "FAILED", reasonCode: r.ok ? null : r.code, summary: r.ok ? "O tribunal respondeu à consulta." : r.message.slice(0, 200), details });
  } catch {
    /* evidência é best-effort: nunca impede a captura */
  }
}

export type SyncAvisosResult = { found: number; imported: number; alreadyKnown: number };

/**
 * Lista os avisos PENDENTES do tribunal e os registra na caixa de entrada (sem duplicar).
 * IMPORTANTE: só LISTA. Não abre o teor da comunicação: no PJe, abrir o teor é o ato que gera CIÊNCIA e dispara a
 * contagem do prazo. O teor deve ser aberto conscientemente pelo advogado.
 */
export async function syncAvisos(ctx: TenantContext, connectionId: string, post: SoapPost = postSoap): Promise<SyncAvisosResult> {
  assertBoxAvailable();
  assertCan(ctx, "inbox:write");
  const { c, secret } = await loadConnection(ctx, connectionId);
  assertConnectionOperation(c, "consultarAvisosPendentes");
  let avisos: MniAviso[];
  try {
    const mtls = await mtlsFor(ctx, c.certificateId, "mni:consultarAvisosPendentes");
    avisos = parseAvisosPendentes(await post(c.endpointUrl, buildConsultarAvisosPendentes(secret), mtls, connectionSoapAction(c, "consultarAvisosPendentes")));
  } catch (err) {
    if (err instanceof MniError) {
      await record(c.id, false, err.message);
      await mniEvidence(ctx, c, "listNotices", { ok: false, code: mniFailureCode(err.message), message: err.message, retryable: true }, evidenceEnv(c, post));
      throw new ConflictError(err.message);
    }
    throw err;
  }
  let imported = 0;
  let alreadyKnown = 0;
  const today = brDate(new Date());
  const capturedAt = new Date();
  for (const a of avisos) {
    const externalKey = `mni:${c.system === "pje-mni" ? "" : `${c.system}:`}${c.jtr}:${a.idAviso}`;
    if (await db.courtNotice.findFirst({ where: { organizationId: ctx.organizationId, externalKey }, select: { id: true } })) {
      alreadyKnown++;
      continue;
    }
    const cnj = a.numeroProcesso ? digitsToCnj(a.numeroProcesso) : null;
    const kindLabel = a.tipo === "CITACAO" ? "Citação" : a.tipo === "INTIMACAO" ? "Intimação" : "Comunicação";
    try {
      await createNotice(
        ctx,
        {
          source: "MANUAL",
          kind: a.tipo === "OUTRO" ? "OUTRO" : a.tipo,
          title: `${kindLabel} eletrônica${cnj ? ` — processo ${cnj}` : ""}`.slice(0, 200),
          content: `Aviso eletrônico nº ${a.idAviso} listado pelo ${c.label}${a.disponibilizadoEm ? `, disponibilizado em ${brDate(a.disponibilizadoEm)}` : ""}${a.classe ? ` (classe ${a.classe})` : ""}.\n\nO teor NÃO foi aberto pelo LegalOS. No PJe, abrir o teor gera ciência e inicia a contagem do prazo: abra no tribunal quando o advogado decidir. Prazos criados a partir desta comunicação continuam como rascunho até validação humana.`,
          caseNumber: cnj ?? "",
          court: c.label.slice(0, 120),
          publishedAt: a.disponibilizadoEm ? brDate(a.disponibilizadoEm) : "",
          receivedAt: today,
          caseId: "",
        },
        // comunicação ELETRÔNICA PRIVADA: origem e identificador oficial próprios; ciência oficial desconhecida (nunca presumida)
        { source: "IMPORTED", externalKey, capture: { originKind: "PRIVATE_COMMUNICATION", sourceSystem: c.system, officialId: a.idAviso, courtCode: c.jtr, capturedAt, evidence: { connection: c.id } } },
      );
      imported++;
    } catch (e) {
      if (isUniqueViolation(e)) alreadyKnown++;
      else throw e;
    }
  }
  await mniEvidence(ctx, c, "listNotices", { ok: true }, evidenceEnv(c, post), { found: avisos.length, imported, alreadyKnown });
  await record(c.id, true, `${avisos.length} aviso(s) pendente(s); ${imported} novo(s).`);
  await audit({ action: "mni.sync_avisos", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_connection", resourceId: c.id, metadata: { found: avisos.length, imported }, meta: ctx.meta });
  return { found: avisos.length, imported, alreadyKnown };
}

/** Conexão ativa que atende o tribunal do número CNJ do processo (ou null). */
export async function connectionForCase(ctx: TenantContext, caseId: string, operation: MniOperation = "consultarProcesso") {
  assertBoxAvailable();
  assertCan(ctx, "cases:read");
  await assertCaseVisible(ctx, caseId);
  const c = await db.case.findFirst({ where: { id: caseId, organizationId: ctx.organizationId }, select: { number: true, courtSystem: true } });
  const jtr = c?.number ? jtrOfCnj(c.number) : null;
  if (!jtr) return null;
  const mapped = c?.courtSystem ?? await systemForJtr(ctx.organizationId, jtr);
  const candidates = await db.courtConnection.findMany({ where: { organizationId: ctx.organizationId, jtr, enabled: true, ...(mapped ? { system: mapped } : {}) }, orderBy: { id: "asc" } });
  const compatible = candidates.filter(row => connectionSupports(row, operation));
  if (compatible.length > 1) throw new ConflictError("Há mais de uma conexão para este processo. Defina o sistema no processo e mantenha uma única conexão ativa para ele.");
  const selected = compatible[0];
  return selected ? { id: selected.id, label: selected.label, system: selected.system, environment: selected.environment } : null;
}

export type ConsultCaseResult = { total: number; imported: number; classe: string | null; orgao: string | null };

/** Consulta o processo no tribunal (MNI) e importa os movimentos novos na linha do tempo. Processos sigilosos não são consultados. */
export async function consultCaseMni(ctx: TenantContext, caseId: string, post: SoapPost = postSoap): Promise<ConsultCaseResult> {
  assertBoxAvailable();
  assertCan(ctx, "cases:write");
  await assertCaseVisible(ctx, caseId);
  const c = await db.case.findFirstOrThrow({ where: { id: caseId, organizationId: ctx.organizationId }, select: { number: true, confidential: true } });
  if (c.confidential) throw new ValidationError("Processos sigilosos não são consultados em serviços externos.");
  if (!c.number) throw new ValidationError("Informe o número CNJ do processo para consultar o tribunal.");
  const conn = await connectionForCase(ctx, caseId);
  if (!conn) throw new ConflictError("Nenhuma conexão PJe/MNI ativa para o tribunal deste processo (cadastre em Integrações).");
  const { c: connection, secret } = await loadConnection(ctx, conn.id, { personal: true });
  assertConnectionOperation(connection, "consultarProcesso");
  let proc: MniProcesso;
  try {
    const mtls = await mtlsFor(ctx, connection.certificateId, "mni:consultarProcesso", caseId);
    proc = parseConsultarProcesso(await post(connection.endpointUrl, buildConsultarProcesso(secret, onlyDigits(c.number)), mtls, connectionSoapAction(connection, "consultarProcesso")));
  } catch (err) {
    if (err instanceof MniError) {
      await record(connection.id, false, err.message);
      throw new ConflictError(err.message);
    }
    throw err;
  }
  const rows = proc.movimentos.map((m) => ({
    organizationId: ctx.organizationId,
    caseId,
    source: "IMPORTED" as const,
    kind: "MNI_MOVEMENT",
    title: (m.descricaoLocal ?? (m.codigoNacional ? `Movimento nacional (código ${m.codigoNacional})` : "Movimento processual")).slice(0, 200),
    description: m.complementos.length ? m.complementos.join("; ") : null,
    occurredAt: m.at,
    externalKey: `mni:${connection.jtr}:${m.id ?? `${m.at.toISOString()}:${m.codigoNacional ?? "x"}`}`.slice(0, 200),
    createdById: ctx.userId,
  }));
  const res = rows.length ? await db.caseEvent.createMany({ data: rows, skipDuplicates: true }) : { count: 0 };
  await record(connection.id, true, `Processo consultado; ${res.count} movimento(s) novo(s).`);
  await audit({ action: "mni.consult_case", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: caseId, metadata: { connectionId: connection.id, total: rows.length, imported: res.count }, meta: ctx.meta });
  return { total: rows.length, imported: res.count, classe: proc.classe, orgao: proc.orgao };
}


export const AUTOS_MAX_PER_RUN = 25;
const AUTOS_BATCH = 5;
const MIME_EXT: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "text/plain": "txt" };

export type ImportAutosResult = { listed: number; imported: number; alreadyKnown: number; skippedSecret: number; skippedUnsupported: number; skippedTooBig: number; remaining: number };

function categoryOf(d: MniDocumento): string {
  const t = `${d.tipo ?? ""} ${d.descricao ?? ""}`.toLowerCase();
  if (/decis|senten|despacho|acord|intima|cita/.test(t)) return "DECISAO";
  if (/peti|contest|recurso|embargo|manifesta/.test(t)) return "PETICAO";
  if (/procura/.test(t)) return "PROCURACAO";
  if (/contrato/.test(t)) return "CONTRATO";
  return "OUTROS";
}

/**
 * Baixa os documentos (autos) do processo no tribunal via MNI e os arquiva nos Documentos do processo, sem duplicar.
 * Em duas fases (lista, depois conteúdo em lotes de 5) para respeitar o limite de resposta. No máximo 25 por execução:
 * rode de novo para continuar. Documentos sigilosos, de tipo não suportado ou acima de 8 MB não são importados (são contados).
 * Consulta de autos NÃO gera ciência de comunicações; mesmo assim, o uso do certificado fica registrado.
 */
export async function importAutosMni(ctx: TenantContext, caseId: string, post: SoapPost = postSoap, excludedIds: string[] = [], onExcluded?: (id: string) => void, limit = AUTOS_MAX_PER_RUN): Promise<ImportAutosResult> {
  assertBoxAvailable();
  assertCan(ctx, "cases:write");
  assertCan(ctx, "documents:write");
  await assertCaseVisible(ctx, caseId);
  const c = await db.case.findFirstOrThrow({ where: { id: caseId, organizationId: ctx.organizationId }, select: { number: true, confidential: true } });
  if (c.confidential) throw new ValidationError("Processos sigilosos não são consultados em serviços externos.");
  if (!c.number) throw new ValidationError("Informe o número CNJ do processo para consultar o tribunal.");
  const conn = await connectionForCase(ctx, caseId);
  if (!conn) throw new ConflictError("Nenhuma conexão PJe/MNI ativa para o tribunal deste processo (cadastre em Integrações).");
  const { c: connection, secret } = await loadConnection(ctx, conn.id, { personal: true });
  assertConnectionOperation(connection, "consultarProcesso");
  if (connection.authProfile === "TJPR_SCMPP") throw new ConflictError("SCMPP/TJPR é um serviço de consulta a movimentações públicas; a importação de autos não está habilitada nesse perfil.");
  const cnj = onlyDigits(c.number);
  const keyOf = (id: string) => `mni:${connection.system === "pje-mni" ? "" : `${connection.system}:${cnj}:`}${connection.jtr}:doc:${id}`.slice(0, 200);
  const res: ImportAutosResult = { listed: 0, imported: 0, alreadyKnown: 0, skippedSecret: 0, skippedUnsupported: 0, skippedTooBig: 0, remaining: 0 };
  try {
    const mtls = await mtlsFor(ctx, connection.certificateId, "mni:consultarProcesso:autos", caseId);
    const list = parseConsultarProcesso(await post(connection.endpointUrl, buildConsultarProcesso(secret, cnj, { movimentos: false }), mtls, connectionSoapAction(connection, "consultarProcesso")));
    const docs = list.documentos;
    res.listed = docs.length;
    const known = new Set((await db.document.findMany({ where: { organizationId: ctx.organizationId, externalKey: { in: docs.map((d) => keyOf(d.id)) } }, select: { externalKey: true } })).map((d) => d.externalKey));
    const todo: MniDocumento[] = [];
    for (const d of docs) {
      if (excludedIds.includes(d.id)) continue;
      if (known.has(keyOf(d.id))) res.alreadyKnown++;
      else if (d.sigilo > 0) { res.skippedSecret++; onExcluded?.(d.id); }
      else todo.push(d);
    }
    const now = todo.slice(0, Math.max(1, Math.min(AUTOS_MAX_PER_RUN, Math.floor(limit))));
    res.remaining = todo.length - now.length;
    for (let i = 0; i < now.length; i += AUTOS_BATCH) {
      const batch = now.slice(i, i + AUTOS_BATCH);
      const got = parseConsultarProcesso(await post(connection.endpointUrl, buildConsultarProcesso(secret, cnj, { movimentos: false, documentIds: batch.map((d) => d.id) }), mtls, connectionSoapAction(connection, "consultarProcesso")));
      const byId = new Map(got.documentos.map((d) => [d.id, d]));
      for (const meta of batch) {
        const d = byId.get(meta.id);
        if (!d?.content) throw new MniError("O tribunal não retornou o conteúdo de um documento solicitado. Tente novamente.");
        if (d.sigilo > 0) { res.skippedSecret++; onExcluded?.(meta.id); continue; }
        if (d.content.length > MAX_DOCUMENT_BYTES) { res.skippedTooBig++; onExcluded?.(meta.id); continue; }
        const ext = MIME_EXT[(d.mimetype ?? meta.mimetype ?? "").toLowerCase().split(";")[0]!.trim()];
        if (!ext) { res.skippedUnsupported++; onExcluded?.(meta.id); continue; }
        const base = sanitizeFileName(`${(meta.descricao ?? meta.tipo ?? "Documento").slice(0, 80)} (${meta.id})`).replace(/\.[a-z0-9]{1,5}$/i, "");
        let cls: { name: string; mime: string };
        try {
          cls = classifyFile(`${base}.${ext}`, d.content);
        } catch {
          res.skippedUnsupported++;
          onExcluded?.(meta.id);
          continue;
        }
        try {
          await storeNewDocument(ctx, { caseId }, { name: cls.name, mime: cls.mime, buffer: d.content }, {
            category: categoryOf(meta),
            description: `Baixado do tribunal (${connection.label}, MNI) — documento nº ${meta.id}${meta.at ? `, de ${brDate(meta.at)}` : ""}.`.slice(0, 1000),
            source: "UPLOAD",
            templateId: null,
            externalKey: keyOf(meta.id),
          });
          res.imported++;
        } catch (e) {
          if (isUniqueViolation(e)) res.alreadyKnown++;
          else throw e;
        }
      }
    }
  } catch (err) {
    await audit({ action: "mni.import_autos_failed", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: caseId, metadata: { connectionId: connection.id, imported: res.imported }, meta: ctx.meta });
    if (err instanceof MniError) {
      await record(connection.id, false, err.message);
      throw new ConflictError(err.message);
    }
    throw err;
  }
  await record(connection.id, true, `Autos: ${res.imported} documento(s) novo(s) de ${res.listed}.`);
  await audit({ action: "mni.import_autos", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: caseId, metadata: { connectionId: connection.id, ...res }, meta: ctx.meta });
  return res;
}

/**
 * Execução automática (agendador externo): sincroniza os avisos de todas as conexões ligadas, cada uma com o contexto
 * de quem a criou. O certificado continua sendo lido pelo cofre (com registro de uso). Só LISTA avisos; nunca abre o teor.
 */
export async function runMniAll(opts: { post?: SoapPost } = {}) {
  assertBoxAvailable();
  const conns = await db.courtConnection.findMany({
    where: { enabled: true, createdById: { not: null }, organization: { deletedAt: null, suspendedAt: null } },
    select: { id: true, organizationId: true, createdById: true, authProfile: true, system: true, wsdlStatus: true, wsdlOperations: true },
    orderBy: { lastSyncAt: { sort: "asc", nulls: "first" } },
  });
  const eligible = conns.filter(c => connectionSupports(c, "consultarAvisosPendentes"));
  const out = { total: eligible.length, ok: 0, failed: 0, imported: 0 };
  for (const cn of eligible) {
    try {
      const ctx = await resolveTenantContext(cn.createdById as string, cn.organizationId, {});
      if (!ctx || !ctx.permissions.has("inbox:write")) {
        await record(cn.id, false, "Quem criou esta conexão não tem mais acesso à caixa de entrada.");
        out.failed++;
        continue;
      }
      const r = await syncAvisos(ctx, cn.id, opts.post);
      out.ok++;
      out.imported += r.imported;
    } catch (e) {
      out.failed++;
      if (!(e instanceof ConflictError)) await record(cn.id, false, "Falha inesperada na sincronização automática.").catch(() => undefined);
    }
  }
  return out;
}

/** Verifica o contrato publicado; não confunde essa verificação com autenticação/homologação. */
export async function inspectConnectionContract(ctx: TenantContext, id: string, fetcher: typeof fetchWsdl = fetchWsdl) {
  assertBoxAvailable();
  assertCan(ctx, "integrations:manage");
  await requireMfa(ctx.userId);
  const { c } = await loadConnection(ctx, id, { allowDisabled: true });
  let inspection;
  try {
    const material = await mtlsFor(ctx, c.certificateId, "mni:wsdl");
    inspection = inspectMniContract(await fetcher(c.wsdlUrl ?? c.endpointUrl, material, Boolean(c.wsdlUrl)), c.endpointUrl);
  } catch (e) {
    if (e instanceof MniError) {
      // Um WSDL indisponível não equivale a sincronização executada nem invalida um contrato anterior.
      await db.$transaction(async tx => {
        const changed = await tx.courtConnection.updateMany({ where: { id: c.id, organizationId: ctx.organizationId, updatedAt: c.updatedAt }, data: { lastStatus: "ERROR", lastMessage: `Verificação WSDL: ${e.message}`.slice(0, 300) } });
        if (changed.count) await audit({ action: "court_connection.contract_check_failed", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_connection", resourceId: c.id, metadata: { stage: "wsdl", message: e.message.slice(0, 300) }, meta: ctx.meta }, tx);
      });
      throw new ConflictError(e.message);
    }
    throw e;
  }
  await db.$transaction(async tx => {
    const changed = await tx.courtConnection.updateMany({ where: { id: c.id, organizationId: ctx.organizationId, updatedAt: c.updatedAt }, data: { wsdlStatus: inspection.compatible ? "COMPATIBLE" : "INCOMPATIBLE", wsdlCheckedAt: new Date(), wsdlOperations: inspection.operations, wsdlActions: inspection.actions, ...(c.lastMessage?.startsWith("Verificação WSDL:") ? { lastStatus: "PENDING", lastMessage: null } : {}), ...(!inspection.compatible ? { enabled: false } : {}) } });
    if (!changed.count) throw new ConflictError("A conexão mudou durante a verificação. Recarregue e tente novamente.");
    await audit({ action: "court_connection.contract_checked", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_connection", resourceId: c.id, metadata: { system: c.system, compatible: inspection.compatible, operations: inspection.operations }, meta: ctx.meta }, tx);
  });
  return inspection;
}
export function assertConnectionOperation(c: { system: string; wsdlStatus: string | null; wsdlOperations: string[]; authProfile?: string }, operation: MniOperation) {
  if (c.authProfile === "TJPR_SCMPP" && operation !== "consultarProcesso") throw new ConflictError("O perfil SCMPP/TJPR só permite consultar movimentações públicas.");
  if (!connectionSupports(c, operation)) throw new ConflictError("A conexão não tem contrato compatível verificado para esta operação. Confira o WSDL e a autorização do tribunal.");
}
