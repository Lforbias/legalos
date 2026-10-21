import { db } from "@/lib/db/client";
import { dateToYmd } from "@/lib/dates/ymd";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { certKey, openBytes, sealBytes } from "@/lib/security/pfx";
import { isValidCnj, isValidCpf, isValidCnpj, onlyDigits } from "@/lib/validation/br-documents";
import { isKnownJtr, jtrOfCnj } from "@/lib/mni/tribunals";
import { postSoap, assertEndpointUrl, type Mtls } from "@/lib/mni/transport";
import { buildConsultarAvisosPendentes, buildConsultarProcesso, MniError, parseAvisosPendentes, parseConsultarProcesso, type MniAviso, type MniDocumento, type MniProcesso } from "@/lib/mni/xml";
import { assertCan, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { assertCaseVisible } from "./case.service";
import { requireMfa, getCertificateMaterial } from "./certificate.service";
import { isUniqueViolation } from "./db-errors";
import { createNotice } from "./notice.service";
import { classifyFile, MAX_DOCUMENT_BYTES, sanitizeFileName, storeNewDocument } from "./document.service";
import { resolveTenantContext } from "./tenant.service";

export const AUTH_MODES = ["PASSWORD", "CERTIFICATE", "PASSWORD_AND_CERTIFICATE"] as const;
export type AuthMode = (typeof AUTH_MODES)[number];

/** Transporte injetável (testes usam um servidor local; produção usa HTTPS real). */
export type SoapPost = (endpoint: string, xml: string, mtls?: Mtls) => Promise<string>;

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

export type ConnectionRow = { id: string; label: string; jtr: string; endpointUrl: string; authMode: string; certificateId: string | null; certificateLabel: string | null; enabled: boolean; lastSyncAt: Date | null; lastStatus: string | null; lastMessage: string | null; petitionTypes: Record<string, string> };

export async function listConnections(ctx: TenantContext): Promise<ConnectionRow[]> {
  assertCan(ctx, "integrations:manage");
  const rows = await db.courtConnection.findMany({ where: { organizationId: ctx.organizationId }, include: { certificate: { select: { label: true } } }, orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({ id: r.id, label: r.label, jtr: r.jtr, endpointUrl: r.endpointUrl, authMode: r.authMode, certificateId: r.certificateId, certificateLabel: r.certificate?.label ?? null, enabled: r.enabled, lastSyncAt: r.lastSyncAt, lastStatus: r.lastStatus, lastMessage: r.lastMessage, petitionTypes: (r.petitionTypes && typeof r.petitionTypes === "object" && !Array.isArray(r.petitionTypes) ? (r.petitionTypes as Record<string, string>) : {}) }));
}

export type ConnectionInput = { label: string; jtr: string; endpointUrl: string; authMode: AuthMode; certificateId?: string | null; document: string; password?: string };

export async function createConnection(ctx: TenantContext, input: ConnectionInput) {
  assertCan(ctx, "integrations:manage");
  const key = requireKey();
  await requireMfa(ctx.userId);
  const label = input.label.trim();
  if (!label || label.length > 120) throw new ValidationError("Informe um nome de até 120 caracteres.", { label: ["Nome obrigatório."] });
  if (!isKnownJtr(input.jtr)) throw new ValidationError("Tribunal inválido.", { jtr: ["Selecione um tribunal da lista."] });
  if (!AUTH_MODES.includes(input.authMode)) throw new ValidationError("Modo de autenticação inválido.");
  try {
    assertEndpointUrl(input.endpointUrl);
  } catch (e) {
    throw new ValidationError((e as Error).message, { endpointUrl: [(e as Error).message] });
  }
  const doc = onlyDigits(input.document);
  if (!(doc.length === 11 ? isValidCpf(doc) : doc.length === 14 ? isValidCnpj(doc) : false)) throw new ValidationError("CPF/CNPJ do consultante inválido.", { document: ["CPF/CNPJ inválido."] });
  const needsPassword = input.authMode !== "CERTIFICATE";
  const needsCert = input.authMode !== "PASSWORD";
  if (needsPassword && !input.password) throw new ValidationError("Informe a senha do PJe.", { password: ["Senha obrigatória neste modo."] });
  let certificateId: string | null = null;
  if (needsCert) {
    const certInputId = input.certificateId ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(certInputId)) throw new ValidationError("Selecione um certificado válido do cofre.", { certificateId: ["Certificado obrigatório neste modo."] });
    const cert = await db.certificate.findFirst({ where: { id: certInputId, organizationId: ctx.organizationId, revokedAt: null, notAfter: { gt: new Date() } }, select: { id: true } });
    if (!cert) throw new ValidationError("Selecione um certificado válido do cofre.", { certificateId: ["Certificado inválido."] });
    certificateId = cert.id;
  }
  const secretEnc = sealBytes(Buffer.from(JSON.stringify({ document: doc, password: needsPassword ? input.password : "" }), "utf8"), key);
  const c = await db.courtConnection.create({ data: { organizationId: ctx.organizationId, label, jtr: input.jtr, endpointUrl: input.endpointUrl.trim(), authMode: input.authMode, certificateId, secretEnc, createdById: ctx.userId }, select: { id: true } });
  await audit({ action: "mni.connection_create", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_connection", resourceId: c.id, metadata: { jtr: input.jtr, authMode: input.authMode }, meta: ctx.meta });
  return c;
}

export async function setConnectionEnabled(ctx: TenantContext, id: string, enabled: boolean) {
  assertCan(ctx, "integrations:manage");
  const r = await db.courtConnection.updateMany({ where: { id, organizationId: ctx.organizationId }, data: { enabled } });
  if (r.count !== 1) throw new NotFoundError("Conexão não encontrada.");
  await audit({ action: enabled ? "mni.connection_enable" : "mni.connection_disable", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_connection", resourceId: id, meta: ctx.meta });
}

/** Remove a conexão e a senha cifrada (irreversível). */
export async function deleteConnection(ctx: TenantContext, id: string) {
  assertCan(ctx, "integrations:manage");
  await requireMfa(ctx.userId);
  const r = await db.courtConnection.deleteMany({ where: { id, organizationId: ctx.organizationId } });
  if (r.count !== 1) throw new NotFoundError("Conexão não encontrada.");
  await audit({ action: "mni.connection_delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_connection", resourceId: id, meta: ctx.meta });
}

export async function loadConnection(ctx: TenantContext, id: string) {
  const c = await db.courtConnection.findFirst({ where: { id, organizationId: ctx.organizationId } });
  if (!c) throw new NotFoundError("Conexão não encontrada.");
  if (!c.enabled) throw new ConflictError("Esta conexão está desligada.");
  const key = requireKey();
  const secret = JSON.parse(openBytes(c.secretEnc, key).toString("utf8")) as { document: string; password: string };
  return { c, secret };
}

export async function mtlsFor(ctx: TenantContext, certificateId: string | null, purpose: string, caseId?: string): Promise<Mtls | undefined> {
  if (!certificateId) return undefined;
  const m = await getCertificateMaterial(ctx, certificateId, purpose, caseId ?? null);
  return { pfx: m.pfx, passphrase: m.passphrase };
}

export async function record(connectionId: string, ok: boolean, message: string) {
  await db.courtConnection.update({ where: { id: connectionId }, data: { lastSyncAt: new Date(), lastStatus: ok ? "OK" : "ERROR", lastMessage: message.slice(0, 300) } });
}

const brDate = (d: Date) => dateToYmd(new Date(d.getTime() - 3 * 3600 * 1000));

export type SyncAvisosResult = { found: number; imported: number; alreadyKnown: number };

/**
 * Lista os avisos PENDENTES do tribunal e os registra na caixa de entrada (sem duplicar).
 * IMPORTANTE: só LISTA. Não abre o teor da comunicação: no PJe, abrir o teor é o ato que gera CIÊNCIA e dispara a
 * contagem do prazo. O teor deve ser aberto conscientemente pelo advogado.
 */
export async function syncAvisos(ctx: TenantContext, connectionId: string, post: SoapPost = postSoap): Promise<SyncAvisosResult> {
  assertCan(ctx, "inbox:write");
  const { c, secret } = await loadConnection(ctx, connectionId);
  let avisos: MniAviso[];
  try {
    const mtls = await mtlsFor(ctx, c.certificateId, "mni:consultarAvisosPendentes");
    avisos = parseAvisosPendentes(await post(c.endpointUrl, buildConsultarAvisosPendentes(secret), mtls));
  } catch (err) {
    if (err instanceof MniError) {
      await record(c.id, false, err.message);
      throw new ConflictError(err.message);
    }
    throw err;
  }
  let imported = 0;
  let alreadyKnown = 0;
  const today = brDate(new Date());
  for (const a of avisos) {
    const externalKey = `mni:${c.jtr}:${a.idAviso}`;
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
        { source: "IMPORTED", externalKey },
      );
      imported++;
    } catch (e) {
      if (isUniqueViolation(e)) alreadyKnown++;
      else throw e;
    }
  }
  await record(c.id, true, `${avisos.length} aviso(s) pendente(s); ${imported} novo(s).`);
  await audit({ action: "mni.sync_avisos", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_connection", resourceId: c.id, metadata: { found: avisos.length, imported }, meta: ctx.meta });
  return { found: avisos.length, imported, alreadyKnown };
}

/** Conexão ativa que atende o tribunal do número CNJ do processo (ou null). */
export async function connectionForCase(ctx: TenantContext, caseId: string) {
  assertCan(ctx, "cases:write");
  await assertCaseVisible(ctx, caseId);
  const c = await db.case.findFirst({ where: { id: caseId, organizationId: ctx.organizationId }, select: { number: true } });
  const jtr = c?.number ? jtrOfCnj(c.number) : null;
  if (!jtr) return null;
  return db.courtConnection.findFirst({ where: { organizationId: ctx.organizationId, jtr, enabled: true }, select: { id: true, label: true } });
}

export type ConsultCaseResult = { total: number; imported: number; classe: string | null; orgao: string | null };

/** Consulta o processo no tribunal (MNI) e importa os movimentos novos na linha do tempo. Processos sigilosos não são consultados. */
export async function consultCaseMni(ctx: TenantContext, caseId: string, post: SoapPost = postSoap): Promise<ConsultCaseResult> {
  assertCan(ctx, "cases:write");
  await assertCaseVisible(ctx, caseId);
  const c = await db.case.findFirstOrThrow({ where: { id: caseId, organizationId: ctx.organizationId }, select: { number: true, confidential: true } });
  if (c.confidential) throw new ValidationError("Processos sigilosos não são consultados em serviços externos.");
  if (!c.number) throw new ValidationError("Informe o número CNJ do processo para consultar o tribunal.");
  const conn = await connectionForCase(ctx, caseId);
  if (!conn) throw new ConflictError("Nenhuma conexão PJe/MNI ativa para o tribunal deste processo (cadastre em Integrações).");
  const { c: connection, secret } = await loadConnection(ctx, conn.id);
  let proc: MniProcesso;
  try {
    const mtls = await mtlsFor(ctx, connection.certificateId, "mni:consultarProcesso", caseId);
    proc = parseConsultarProcesso(await post(connection.endpointUrl, buildConsultarProcesso(secret, onlyDigits(c.number)), mtls));
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
export async function importAutosMni(ctx: TenantContext, caseId: string, post: SoapPost = postSoap): Promise<ImportAutosResult> {
  assertCan(ctx, "cases:write");
  assertCan(ctx, "documents:write");
  await assertCaseVisible(ctx, caseId);
  const c = await db.case.findFirstOrThrow({ where: { id: caseId, organizationId: ctx.organizationId }, select: { number: true, confidential: true } });
  if (c.confidential) throw new ValidationError("Processos sigilosos não são consultados em serviços externos.");
  if (!c.number) throw new ValidationError("Informe o número CNJ do processo para consultar o tribunal.");
  const conn = await connectionForCase(ctx, caseId);
  if (!conn) throw new ConflictError("Nenhuma conexão PJe/MNI ativa para o tribunal deste processo (cadastre em Integrações).");
  const { c: connection, secret } = await loadConnection(ctx, conn.id);
  const cnj = onlyDigits(c.number);
  const keyOf = (id: string) => `mni:${connection.jtr}:doc:${id}`.slice(0, 200);
  const res: ImportAutosResult = { listed: 0, imported: 0, alreadyKnown: 0, skippedSecret: 0, skippedUnsupported: 0, skippedTooBig: 0, remaining: 0 };
  try {
    const mtls = await mtlsFor(ctx, connection.certificateId, "mni:consultarProcesso:autos", caseId);
    const list = parseConsultarProcesso(await post(connection.endpointUrl, buildConsultarProcesso(secret, cnj, { movimentos: false }), mtls));
    const docs = list.documentos;
    res.listed = docs.length;
    const known = new Set((await db.document.findMany({ where: { organizationId: ctx.organizationId, externalKey: { in: docs.map((d) => keyOf(d.id)) } }, select: { externalKey: true } })).map((d) => d.externalKey));
    const todo: MniDocumento[] = [];
    for (const d of docs) {
      if (known.has(keyOf(d.id))) res.alreadyKnown++;
      else if (d.sigilo > 0) res.skippedSecret++;
      else todo.push(d);
    }
    const now = todo.slice(0, AUTOS_MAX_PER_RUN);
    res.remaining = todo.length - now.length;
    for (let i = 0; i < now.length; i += AUTOS_BATCH) {
      const batch = now.slice(i, i + AUTOS_BATCH);
      const got = parseConsultarProcesso(await post(connection.endpointUrl, buildConsultarProcesso(secret, cnj, { movimentos: false, documentIds: batch.map((d) => d.id) }), mtls));
      const byId = new Map(got.documentos.map((d) => [d.id, d]));
      for (const meta of batch) {
        const d = byId.get(meta.id);
        if (!d?.content) { res.skippedUnsupported++; continue; }
        if (d.sigilo > 0) { res.skippedSecret++; continue; }
        if (d.content.length > MAX_DOCUMENT_BYTES) { res.skippedTooBig++; continue; }
        const ext = MIME_EXT[(d.mimetype ?? meta.mimetype ?? "").toLowerCase().split(";")[0]!.trim()];
        if (!ext) { res.skippedUnsupported++; continue; }
        const base = sanitizeFileName(`${(meta.descricao ?? meta.tipo ?? "Documento").slice(0, 80)} (${meta.id})`).replace(/\.[a-z0-9]{1,5}$/i, "");
        let cls: { name: string; mime: string };
        try {
          cls = classifyFile(`${base}.${ext}`, d.content);
        } catch {
          res.skippedUnsupported++;
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
  const conns = await db.courtConnection.findMany({
    where: { enabled: true, createdById: { not: null }, organization: { deletedAt: null, suspendedAt: null } },
    select: { id: true, organizationId: true, createdById: true },
    orderBy: { lastSyncAt: { sort: "asc", nulls: "first" } },
  });
  const out = { total: conns.length, ok: 0, failed: 0, imported: 0 };
  for (const cn of conns) {
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
