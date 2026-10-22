import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/permissions/check";
import { totpCode, totpStep } from "@/lib/security/totp";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { deleteClientCredential, listClientCredentials, revealClientCredential, saveClientCredential } from "@/server/services/client-vault.service";
import { accessReview, createRoleFromTemplate, listRoleTemplates } from "@/server/services/role.service";
import { addMember, META, makeOrgWithOwner } from "./helpers";

const saved = { ...process.env };
async function enroll(userId: string, email: string) {
  const s = await startEnrollment(userId, email);
  const code = totpCode(s.secret, totpStep());
  const codes = await confirmEnrollment(userId, code, META);
  return { secret: s.secret, codes };
}

describe("2.0-F11 — cofre de credenciais de clientes e perfis com mínimo de acesso", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let clientId: string;
  let secretOwner: string;
  let recovery: string[];
  let credId: string;

  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    A = await makeOrgWithOwner("f11-a");
    B = await makeOrgWithOwner("f11-b");
    lawyer = await addMember(A.org.id, "LAWYER", "f11-law");
    clientId = (await db.client.create({ data: { organizationId: A.org.id, type: "PERSON", name: "Maria da Silva" } })).id;
    const e = await enroll(A.owner.id, A.owner.email);
    secretOwner = e.secret;
    recovery = e.codes;
  });
  afterAll(async () => {
    await db.clientCredential.deleteMany({ where: { organizationId: A.org.id } });
    process.env = { ...saved };
  });

  it("Proprietário e Administrador nascem com acesso; advogado e demais não", async () => {
    const roles = await db.role.findMany({ where: { organizationId: A.org.id, isSystem: true }, select: { key: true, permissions: true } });
    const withVault = roles.filter((r) => r.permissions.includes("vault:read")).map((r) => r.key).sort();
    expect(withVault).toEqual(["ADMIN", "OWNER"]);
    await expect(listClientCredentials(lawyer.ctx, clientId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveClientCredential(lawyer.ctx, clientId, null, { system: "Meu INSS", label: "x", login: "1", password: "2" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("cadastrar exige 2FA ativo; valida campos; a lista nunca mostra segredo", async () => {
    const adminNoMfa = await addMember(A.org.id, "ADMIN", "f11-admin-nomfa");
    await expect(saveClientCredential(adminNoMfa.ctx, clientId, null, { system: "Meu INSS", label: "Meu INSS da Maria", login: "52998224725", password: "Segredo@123" })).rejects.toBeInstanceOf(ConflictError);
    await expect(saveClientCredential(A.ctx, clientId, null, { system: "Meu INSS", label: "x", login: "1", password: "2" })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveClientCredential(A.ctx, clientId, null, { system: "Meu INSS", label: "Meu INSS da Maria", login: "", password: "2" })).rejects.toBeInstanceOf(ValidationError);
    const r = await saveClientCredential(A.ctx, clientId, null, { system: "Meu INSS", label: "Meu INSS da Maria", login: "52998224725", password: "Segredo@123", notes: "Pergunta: nome da mãe" });
    credId = r.id;
    const list = await listClientCredentials(A.ctx, clientId);
    expect(list).toHaveLength(1);
    const json = JSON.stringify(list);
    expect(json).not.toContain("Segredo@123");
    expect(json).not.toContain("52998224725");
    const raw = await db.clientCredential.findUniqueOrThrow({ where: { id: credId } });
    expect(raw.secretEnc).not.toContain("Segredo@123");
    const audits = JSON.stringify(await db.auditLog.findMany({ where: { organizationId: A.org.id, action: { startsWith: "vault." } } }));
    expect(audits).not.toContain("Segredo@123");
  });

  it("ver a senha exige o código do 2FA na hora (cada código vale uma vez) e fica registrado", async () => {
    await expect(revealClientCredential(A.ctx, credId, "000000")).rejects.toBeInstanceOf(ValidationError);
    await expect(revealClientCredential(A.ctx, credId, "")).rejects.toBeInstanceOf(ValidationError);
    // o código usado na confirmação do 2FA não pode ser reaproveitado; usa o do passo seguinte
    const code = totpCode(secretOwner, totpStep() + 1);
    const s = await revealClientCredential(A.ctx, credId, code);
    expect(s).toMatchObject({ login: "52998224725", password: "Segredo@123", notes: "Pergunta: nome da mãe", system: "Meu INSS" });
    await expect(revealClientCredential(A.ctx, credId, code)).rejects.toBeInstanceOf(ValidationError); // replay
    const list = await listClientCredentials(A.ctx, clientId);
    expect(list[0]!.lastRevealedBy).toBeTruthy();
    expect(list[0]!.lastRevealedAt).toBeTruthy();
    const acts = (await db.auditLog.findMany({ where: { organizationId: A.org.id, action: { startsWith: "vault." } }, select: { action: true } })).map((a) => a.action);
    expect(acts).toEqual(expect.arrayContaining(["vault.create", "vault.reveal", "vault.reveal_denied"]));
  });

  it("trocar sem senha mantém a senha; apagar remove; outro escritório não enxerga", async () => {
    await saveClientCredential(A.ctx, clientId, credId, { system: "gov.br", label: "gov.br da Maria", login: "52998224725", password: "" });
    const s = await revealClientCredential(A.ctx, credId, recovery[0]!); // código de recuperação também vale (uso único)
    expect(s.password).toBe("Segredo@123");
    expect(s.system).toBe("gov.br");
    await enroll(B.owner.id, B.owner.email);
    await expect(revealClientCredential(B.ctx, credId, "123456")).rejects.toThrow(/não encontrada/);
    await expect(revealClientCredential(A.ctx, credId, recovery[0]!)).rejects.toBeInstanceOf(ValidationError); // recuperação já usada
    await expect(deleteClientCredential(B.ctx, credId)).rejects.toThrow();
    await deleteClientCredential(A.ctx, credId);
    expect(await listClientCredentials(A.ctx, clientId)).toHaveLength(0);
  });

  it("modelos de perfil com o mínimo de acesso: cria perfil personalizado sem permissões sensíveis e não duplica", async () => {
    expect(listRoleTemplates(A.ctx).length).toBeGreaterThanOrEqual(4);
    await expect(createRoleFromTemplate(lawyer.ctx, "atendimento")).rejects.toBeInstanceOf(ForbiddenError);
    const r = await createRoleFromTemplate(A.ctx, "atendimento");
    const role = await db.role.findUniqueOrThrow({ where: { id: r.id } });
    expect(role.isSystem).toBe(false);
    expect(role.permissions).toEqual(expect.arrayContaining(["whatsapp:read", "whatsapp:write"]));
    expect(role.permissions.some((p) => p.startsWith("vault:") || p.startsWith("finance:"))).toBe(false);
    await expect(createRoleFromTemplate(A.ctx, "atendimento")).rejects.toBeInstanceOf(ConflictError);
    await expect(createRoleFromTemplate(A.ctx, "inexistente")).rejects.toThrow();
  });

  it("revisão de acessos: aponta quem tem acesso sensível sem 2FA", async () => {
    await expect(accessReview(lawyer.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    const rev = await accessReview(A.ctx);
    const owner = rev.rows.find((x) => x.userId === A.owner.id)!;
    expect(owner.mfaEnabled).toBe(true);
    expect(owner.sensitive).toContain("vault:read");
    const noMfaAdmin = rev.rows.find((x) => x.name.includes("nomfa") || x.email.includes("nomfa"));
    expect(noMfaAdmin?.atRisk).toBe(true);
    expect(rev.rows[0]!.atRisk).toBe(true); // quem está em risco aparece primeiro
    expect(rev.owners).toBe(1);
  });
});
