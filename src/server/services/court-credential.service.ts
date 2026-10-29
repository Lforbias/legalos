import { assertBoxAvailable } from "@/server/box-guard";
import { connectionSupports } from "@/lib/connectors/capabilities";
import { db } from "@/lib/db/client";
import { checkRequirements, COURT_SYSTEMS, getCourtSystem, type AuthMode } from "@/lib/court-systems";
import { isKnownJtr } from "@/lib/mni/tribunals";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { certKey, openBytes, sealBytes } from "@/lib/security/pfx";
import { onlyDigits } from "@/lib/validation/br-documents";
import { assertCan, can, type TenantContext } from "@/server/context";
import { audit } from "./audit.service";
import { assertCertificateUsable, requireMfa } from "./certificate.service";

/**
 * 3.0-F6b — credenciais de acesso aos sistemas dos tribunais, por USUÁRIO e por tribunal/sistema.
 * Cada pessoa guarda a própria; o segredo é cifrado (mesma chave do cofre), nunca volta para tela ou API e só é aberto
 * pelo próprio dono ao usar o conector. Administradores de integrações veem quem tem credencial e podem remover
 * (ex.: quando alguém sai), mas nunca leem o segredo.
 */

function requireKey(): Buffer {
  const k = certKey();
  if (!k) throw new ConflictError("O cofre não está configurado neste sistema (falta CERT_ENCRYPTION_KEY).");
  return k;
}

export type CredentialRow = { id: string; userId: string; userName: string; system: string; systemLabel: string; courtCode: string; authMode: string; certificateId: string | null; documentHint: string; connector: boolean; checkedAt: Date | null; checkStatus: string | null; checkMessage: string | null; mine: boolean };

const hint = (doc: string) => (doc.length === 11 ? `CPF final ${doc.slice(-2)}` : `CNPJ final ${doc.slice(-4)}`);

async function rows(ctx: TenantContext, where: { userId?: string }): Promise<CredentialRow[]> {
  const list = await db.courtCredential.findMany({ where: { organizationId: ctx.organizationId, ...where }, orderBy: [{ system: "asc" }, { courtCode: "asc" }] });
  const users = list.length ? await db.user.findMany({ where: { id: { in: [...new Set(list.map((c) => c.userId))] } }, select: { id: true, name: true } }) : [];
  const key = list.length ? requireKey() : null;
  return list.map((c) => {
    let doc = "";
    try {
      doc = (JSON.parse(openBytes(c.secretEnc, key!).toString("utf8")) as { document: string }).document;
    } catch {
      doc = "";
    }
    const sys = getCourtSystem(c.system);
    return { id: c.id, userId: c.userId, userName: users.find((u) => u.id === c.userId)?.name ?? "Usuário removido", system: c.system, systemLabel: sys?.label ?? c.system, courtCode: c.courtCode, authMode: c.authMode, certificateId: c.certificateId, documentHint: doc ? hint(doc) : "—", connector: !!sys?.connector, checkedAt: c.checkedAt, checkStatus: c.checkStatus, checkMessage: c.checkMessage, mine: c.userId === ctx.userId };
  });
}

export async function listMyCredentials(ctx: TenantContext) {
  assertBoxAvailable();
  assertCan(ctx, "cases:read");
  return rows(ctx, { userId: ctx.userId });
}

/** Para quem administra integrações: quem tem credencial de quê (sem segredo). */
export async function listOrgCredentials(ctx: TenantContext) {
  assertBoxAvailable();
  assertCan(ctx, "integrations:manage");
  return rows(ctx, {});
}

export type SaveCredentialInput = { system: string; courtCode?: string | null; authMode: string; document: string; password?: string | null; certificateId?: string | null };

export async function saveMyCredential(ctx: TenantContext, input: SaveCredentialInput) {
  assertBoxAvailable();
  assertCan(ctx, "cases:read");
  const key = requireKey();
  await requireMfa(ctx.userId);
  const sys = getCourtSystem(input.system);
  if (!sys) throw new ValidationError("Sistema de tribunal inválido.", { system: ["Escolha um sistema da lista."] });
  const courtCode = (input.courtCode ?? "").trim();
  if (courtCode && !isKnownJtr(courtCode)) throw new ValidationError("Tribunal inválido.", { courtCode: ["Escolha um tribunal da lista (ou deixe vazio para todos)."] });
  const problems = checkRequirements({ system: input.system, authMode: input.authMode, document: input.document, password: input.password, certificateId: input.certificateId });
  if (problems.length) throw new ValidationError(problems[0]!, { form: problems });
  const needsPassword = input.authMode !== "CERTIFICATE";
  const needsCert = input.authMode !== "PASSWORD";
  if (needsCert) await assertCertificateUsable(ctx, input.certificateId!);
  const secretEnc = sealBytes(Buffer.from(JSON.stringify({ document: onlyDigits(input.document), password: needsPassword ? input.password : "" }), "utf8"), key);
  const data = { authMode: input.authMode, certificateId: needsCert ? input.certificateId! : null, secretEnc, checkedAt: null, checkStatus: null, checkMessage: null };
  const c = await db.courtCredential.upsert({
    where: { organizationId_userId_system_courtCode: { organizationId: ctx.organizationId, userId: ctx.userId, system: input.system, courtCode } },
    create: { organizationId: ctx.organizationId, userId: ctx.userId, system: input.system, courtCode, ...data },
    update: data,
    select: { id: true },
  });
  await audit({ action: "court_credential.save", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_credential", resourceId: c.id, metadata: { system: input.system, courtCode, authMode: input.authMode }, meta: ctx.meta });
  return c;
}

/** O dono remove a própria; quem administra integrações remove a de qualquer pessoa do escritório. */
export async function deleteCredential(ctx: TenantContext, id: string) {
  assertBoxAvailable();
  await requireMfa(ctx.userId);
  const admin = can(ctx, "integrations:manage");
  const r = await db.courtCredential.deleteMany({ where: { id, organizationId: ctx.organizationId, ...(admin ? {} : { userId: ctx.userId }) } });
  if (r.count !== 1) throw new NotFoundError("Credencial não encontrada.");
  await audit({ action: "court_credential.delete", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "court_credential", resourceId: id, meta: ctx.meta });
}

/**
 * Confere a credencial da própria pessoa contra o que o sistema exige e contra o estado do certificado.
 * NÃO acessa o tribunal (isso depende do conector e de acesso real): diz "completa e pronta" ou o que falta.
 */
export async function verifyMyCredential(ctx: TenantContext, id: string) {
  assertBoxAvailable();
  const c = await db.courtCredential.findFirst({ where: { id, organizationId: ctx.organizationId, userId: ctx.userId } });
  if (!c) throw new NotFoundError("Credencial não encontrada.");
  const key = requireKey();
  const secret = JSON.parse(openBytes(c.secretEnc, key).toString("utf8")) as { document: string; password: string };
  const problems = checkRequirements({ system: c.system, authMode: c.authMode, document: secret.document, password: secret.password, certificateId: c.certificateId });
  if (c.authMode !== "PASSWORD" && c.certificateId) await assertCertificateUsable(ctx, c.certificateId).catch((e: Error) => problems.push(e.message));
  const sys = getCourtSystem(c.system);
  const connections = c.system !== "pje-mni" ? await db.courtConnection.findMany({ where: { organizationId: ctx.organizationId, system: c.system, enabled: true, ...(c.courtCode ? { jtr: c.courtCode } : {}) } }) : [];
  const configured = c.system === "pje-mni" ? Boolean(sys?.connector) : connections.some(row => connectionSupports(row, "consultarProcesso"));
  const status = problems.length ? "PENDENTE" : configured ? "PRONTA" : "SEM_CONECTOR";
  const message = problems.length ? problems.join(" ") : configured ? "Credencial completa. A validade no tribunal só se confirma ao usar." : `Credencial completa, mas não há conexão MNI compatível configurada para ${sys?.label ?? c.system}.`;
  await db.courtCredential.update({ where: { id }, data: { checkedAt: new Date(), checkStatus: status, checkMessage: message.slice(0, 300) } });
  return { status, message };
}

/**
 * Uso interno pelos conectores: a credencial pessoal de QUEM está agindo para o sistema/tribunal (a do tribunal exato vale mais que a geral).
 * Devolve null se a pessoa não tiver. Nunca é exposta por tela ou rota.
 */
export async function resolveMyCredential(ctx: TenantContext, system: string, courtCode: string) {
  assertBoxAvailable();
  const list = await db.courtCredential.findMany({ where: { organizationId: ctx.organizationId, userId: ctx.userId, system, courtCode: { in: [courtCode, ""] } } });
  const c = list.find((x) => x.courtCode === courtCode) ?? list.find((x) => x.courtCode === "");
  if (!c) return null;
  const secret = JSON.parse(openBytes(c.secretEnc, requireKey()).toString("utf8")) as { document: string; password: string };
  return { id: c.id, authMode: c.authMode as AuthMode, certificateId: c.certificateId, secret };
}

export { COURT_SYSTEMS };
