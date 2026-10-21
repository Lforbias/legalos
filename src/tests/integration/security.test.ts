import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, UnauthorizedError, ValidationError } from "@/lib/permissions/check";
import { totpCode, totpStep } from "@/lib/security/totp";
import { completeMfaLogin, getSessionByToken, login, startLogin } from "@/server/services/auth.service";
import { confirmEnrollment, disableMfa, mfaStatus, regenerateRecoveryCodes, startEnrollment } from "@/server/services/mfa.service";
import { META, makeUser } from "./helpers";

const PASS = "SenhaForte123";
const KEY = Buffer.alloc(32, 9).toString("base64");

async function enableMfa(userId: string, email: string) {
  const setup = await startEnrollment(userId, email);
  const codes = await confirmEnrollment(userId, totpCode(setup.secret, totpStep()), META);
  return { secret: setup.secret, codes };
}

describe("bloqueio de conta por tentativas (Fase 9a)", () => {
  it("5 senhas erradas bloqueiam por 15 min, até a senha certa é recusada; desbloqueado volta a entrar", async () => {
    const u = await makeUser("lock");
    for (let i = 0; i < 5; i++) await expect(login({ email: u.email, password: "errada-errada1" }, META)).rejects.toBeInstanceOf(UnauthorizedError);
    const row = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.lockedUntil).not.toBeNull();
    await expect(login({ email: u.email, password: PASS }, META)).rejects.toThrow(/inválidos/);
    expect(await db.auditLog.count({ where: { userId: u.id, action: "auth.account_locked" } })).toBe(1);
    await db.user.update({ where: { id: u.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    const ok = await login({ email: u.email, password: PASS }, META);
    expect(ok.token).toBeTruthy();
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).failedLoginCount).toBe(0);
  });
  it("login correto zera o contador de falhas", async () => {
    const u = await makeUser("count");
    await login({ email: u.email, password: "errada-errada1" }, META).catch(() => null);
    await login({ email: u.email, password: PASS }, META);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).failedLoginCount).toBe(0);
  });
});

describe("verificação em duas etapas (Fase 9a)", () => {
  beforeAll(() => {
    process.env.MFA_ENCRYPTION_KEY = KEY;
  });

  it("sem MFA_ENCRYPTION_KEY o cadastro é recusado com mensagem clara", async () => {
    const u = await makeUser("nokey");
    delete process.env.MFA_ENCRYPTION_KEY;
    await expect(startEnrollment(u.id, u.email)).rejects.toBeInstanceOf(ConflictError);
    process.env.MFA_ENCRYPTION_KEY = KEY;
  });

  it("cadastro: segredo cifrado no banco, código errado não ativa, código certo ativa e gera 10 códigos de recuperação", async () => {
    const u = await makeUser("enroll");
    const setup = await startEnrollment(u.id, u.email);
    const raw = await db.userMfa.findUniqueOrThrow({ where: { userId: u.id } });
    expect(raw.secretEnc).not.toContain(setup.secret);
    expect(raw.enabledAt).toBeNull();
    expect(setup.qrDataUrl.startsWith("data:image/png")).toBe(true);
    await expect(confirmEnrollment(u.id, "000000", META)).rejects.toBeInstanceOf(ValidationError);
    const codes = await confirmEnrollment(u.id, totpCode(setup.secret, totpStep()), META);
    expect(codes).toHaveLength(10);
    const st = await mfaStatus(u.id);
    expect(st).toMatchObject({ enabled: true, recoveryCodesLeft: 10 });
    const stored = await db.mfaRecoveryCode.findMany({ where: { userId: u.id } });
    expect(stored.some((r) => codes.includes(r.codeHash))).toBe(false);
    await expect(startEnrollment(u.id, u.email)).rejects.toBeInstanceOf(ConflictError);
  });

  it("com MFA ativo: login simples é recusado; startLogin devolve desafio; só o código abre a sessão", async () => {
    const u = await makeUser("flow");
    const { secret } = await enableMfa(u.id, u.email);
    await expect(login({ email: u.email, password: PASS }, META)).rejects.toBeInstanceOf(UnauthorizedError);
    const r = await startLogin({ email: u.email, password: PASS }, META, "/processos");
    expect(r.kind).toBe("mfa");
    if (r.kind !== "mfa") return;
    expect(await db.session.count({ where: { userId: u.id, createdAt: { gt: new Date(Date.now() - 60_000) } } })).toBe(0);
    await expect(completeMfaLogin(r.challengeToken, "000000", META)).rejects.toThrow(/Código inválido/);
    // passo seguinte ao usado no cadastro (evita colidir com o anti-replay do cadastro)
    const next = totpCode(secret, totpStep() + 1);
    const done = await completeMfaLogin(r.challengeToken, next, META);
    expect(done.redirectTo).toBe("/processos");
    expect((await getSessionByToken(done.token))?.user.id).toBe(u.id);
    // o desafio é de uso único
    await expect(completeMfaLogin(r.challengeToken, next, META)).rejects.toThrow(/expirada/);
  });

  it("anti-replay: o mesmo código TOTP não vale duas vezes", async () => {
    const u = await makeUser("replay");
    const { secret } = await enableMfa(u.id, u.email);
    const code = totpCode(secret, totpStep() + 1);
    const a = await startLogin({ email: u.email, password: PASS }, META, "/");
    const b = await startLogin({ email: u.email, password: PASS }, META, "/");
    if (a.kind !== "mfa" || b.kind !== "mfa") throw new Error("esperava desafio");
    await completeMfaLogin(a.challengeToken, code, META);
    await expect(completeMfaLogin(b.challengeToken, code, META)).rejects.toThrow(/Código inválido/);
  });

  it("5 tentativas erradas invalidam o desafio, mesmo com o código certo depois", async () => {
    const u = await makeUser("brute");
    const { secret } = await enableMfa(u.id, u.email);
    const r = await startLogin({ email: u.email, password: PASS }, META, "/");
    if (r.kind !== "mfa") throw new Error("esperava desafio");
    for (let i = 0; i < 5; i++) await expect(completeMfaLogin(r.challengeToken, "000000", META)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(completeMfaLogin(r.challengeToken, totpCode(secret, totpStep() + 1), META)).rejects.toThrow(/expirada/);
  });

  it("código de recuperação funciona uma única vez; regenerar invalida os antigos; desativar exige a senha", async () => {
    const u = await makeUser("recovery");
    const { codes } = await enableMfa(u.id, u.email);
    const a = await startLogin({ email: u.email, password: PASS }, META, "/");
    if (a.kind !== "mfa") throw new Error("esperava desafio");
    await completeMfaLogin(a.challengeToken, codes[0]!.toLowerCase(), META);
    expect((await mfaStatus(u.id)).recoveryCodesLeft).toBe(9);
    const b = await startLogin({ email: u.email, password: PASS }, META, "/");
    if (b.kind !== "mfa") throw new Error("esperava desafio");
    await expect(completeMfaLogin(b.challengeToken, codes[0]!, META)).rejects.toThrow(/Código inválido/);

    await expect(regenerateRecoveryCodes(u.id, "senha-errada1", META)).rejects.toBeInstanceOf(ValidationError);
    const fresh = await regenerateRecoveryCodes(u.id, PASS, META);
    expect(fresh).toHaveLength(10);
    const c = await startLogin({ email: u.email, password: PASS }, META, "/");
    if (c.kind !== "mfa") throw new Error("esperava desafio");
    await expect(completeMfaLogin(c.challengeToken, codes[1]!, META)).rejects.toThrow(/Código inválido/);

    await expect(disableMfa(u.id, "senha-errada1", META)).rejects.toBeInstanceOf(ValidationError);
    await disableMfa(u.id, PASS, META);
    expect((await mfaStatus(u.id)).enabled).toBe(false);
    expect((await login({ email: u.email, password: PASS }, META)).token).toBeTruthy();
  });
});
