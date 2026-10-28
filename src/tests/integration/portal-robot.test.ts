import type { Page } from "playwright-core";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import type { LoginOutcome } from "@/lib/robots/pje/login";
import { MAX_ATTEMPTS } from "@/lib/robots/pje/outcome";
import { totpCode, totpStep, generateTotpSecret } from "@/lib/security/totp";
import { claimNextJob, drainQueue, recoverStuckJobs, runJob, type RobotDeps } from "@/server/robots/pje-runner";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { connectPje, deletePortalAccess, enqueueDueSyncs, listMyPortalAccesses, setPortalAccessEnabled, testPortalAccess } from "@/server/services/portal-access.service";
import { META, addMember, makeOrgWithOwner } from "./helpers";

const SIG = { host: "pje1g.trf1.jus.br", path: "/pje/home.seam", title: "Painel", headings: [], fields: [], buttons: [] };
const ok: LoginOutcome = { ok: true, signature: SIG };
const bad = (code: Extract<LoginOutcome, { ok: false }>["code"], retryable = false): LoginOutcome => ({ ok: false, code, message: `falha ${code}`, retryable, signature: SIG });
const depsFor = (outcome: LoginOutcome, now?: () => Date): RobotDeps => ({
  openPage: async () => ({ page: {} as Page, close: async () => undefined }),
  login: async () => outcome,
  probe: async () => ({ landing: SIG, panel: SIG }),
  now,
});

describe("robô dos portais: acessos, fila e resultado", () => {
  let a: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  const PASSWORD = "senha-do-pje-SECRETA-42";
  const CPF = "52998224725";
  const connect = (targets = ["trf1-1g", "trf1-2g"], otp?: string) => connectPje(a.ctx, { targets, document: CPF, password: PASSWORD, ...(otp ? { otp } : {}) });
  const reset = async () => { await db.robotJob.deleteMany({ where: { organizationId: a.org.id } }); await db.portalAccess.deleteMany({ where: { organizationId: a.org.id } }); };

  beforeAll(async () => {
    process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    a = await makeOrgWithOwner("robo");
    const enrollment = await startEnrollment(a.owner.id, a.owner.email);
    await confirmEnrollment(a.owner.id, totpCode(enrollment.secret, totpStep()), META);
  });

  it("exige a verificação em duas etapas do LegalOS para guardar a senha", async () => {
    const m = await addMember(a.org.id, "LAWYER", "sem-mfa");
    await expect(connectPje(m.ctx, { targets: ["trf1-1g"], document: CPF, password: "x" })).rejects.toThrow(/duas etapas/);
  });

  it("recusa destino fora da lista, CPF inválido e campos extras", async () => {
    await expect(connectPje(a.ctx, { targets: ["https://evil.example"], document: CPF, password: "x" })).rejects.toThrow();
    await expect(connectPje(a.ctx, { targets: ["trf1-1g"], document: "11111111111", password: "x" })).rejects.toThrow(/CPF/);
    await expect(connectPje(a.ctx, { targets: ["trf1-1g"], document: CPF, password: "x", url: "https://evil.example" })).rejects.toThrow();
    expect(await db.portalAccess.count({ where: { organizationId: a.org.id } })).toBe(0);
  });

  it("guarda o segredo cifrado, enfileira só o primeiro teste e nunca devolve a senha", async () => {
    await reset();
    const otpSecret = generateTotpSecret();
    const { ids } = await connect(["trf1-1g", "trf1-2g"], otpSecret);
    expect(ids).toHaveLength(2);
    const rows = await db.portalAccess.findMany({ where: { organizationId: a.org.id }, orderBy: { target: "asc" } });
    for (const r of rows) {
      expect(r.secretEnc).not.toContain(PASSWORD);
      expect(r.secretEnc).not.toContain(otpSecret);
    }
    expect(rows.map((r) => r.status).sort()).toEqual(["CONNECTING", "PENDING"]);
    expect(await db.robotJob.count({ where: { organizationId: a.org.id, status: "QUEUED", kind: "LOGIN_TEST" } })).toBe(1);
    const list = await listMyPortalAccesses(a.ctx);
    expect(JSON.stringify(list)).not.toContain(PASSWORD);
    expect(JSON.stringify(list)).not.toContain(otpSecret);
    expect(list[0]).toMatchObject({ documentHint: "CPF final 25", hasOtp: true });
  });

  it("dois workers não pegam o mesmo trabalho", async () => {
    await reset();
    await connect(["trf1-1g"]);
    const got = await Promise.all([claimNextJob(), claimNextJob(), claimNextJob()]);
    expect(got.filter(Boolean)).toHaveLength(1);
  });

  it("login ok: conecta, registra o acesso e testa o outro tribunal na sequência", async () => {
    await reset();
    await connect(["trf1-1g", "trf1-2g"]);
    const first = (await claimNextJob())!;
    expect(await runJob(first.id, depsFor(ok))).toEqual({ status: "DONE" });
    const rows = await db.portalAccess.findMany({ where: { organizationId: a.org.id }, orderBy: { target: "asc" } });
    expect(rows[0]).toMatchObject({ status: "CONNECTED", enabled: true });
    expect(rows[0]!.lastLoginAt).not.toBeNull();
    expect(rows[1]).toMatchObject({ status: "CONNECTING" });
    expect(await drainQueue(depsFor(ok))).toBe(1);
    expect((await db.portalAccess.findMany({ where: { organizationId: a.org.id } })).every((r) => r.status === "CONNECTED")).toBe(true);
    expect(await db.auditLog.count({ where: { organizationId: a.org.id, action: "portal_access.login_ok" } })).toBeGreaterThanOrEqual(2);
  });

  it("senha recusada: pede ação, não repete sozinho e só libera depois de salvar de novo", async () => {
    await reset();
    await connect(["trf1-1g"]);
    const job = (await claimNextJob())!;
    expect(await runJob(job.id, depsFor(bad("BAD_CREDENTIALS")))).toEqual({ status: "WAITING_PERSON" });
    const access = await db.portalAccess.findFirstOrThrow({ where: { organizationId: a.org.id } });
    expect(access.status).toBe("NEEDS_ACTION");
    expect(await claimNextJob()).toBeNull();
    await db.robotJob.updateMany({ where: { accessId: access.id }, data: { createdAt: new Date(Date.now() - 10 * 60_000) } });
    await expect(testPortalAccess(a.ctx, access.id)).rejects.toThrow(/recusou/);
    await connect(["trf1-1g"]);
    expect((await db.portalAccess.findFirstOrThrow({ where: { id: access.id } })).status).toBe("CONNECTING");
  });

  it("bloqueio da conta desliga o acesso", async () => {
    await reset();
    await connect(["trf1-1g"]);
    const job = (await claimNextJob())!;
    await runJob(job.id, depsFor(bad("ACCOUNT_BLOCKED")));
    expect(await db.portalAccess.findFirstOrThrow({ where: { organizationId: a.org.id } })).toMatchObject({ status: "NEEDS_ACTION", enabled: false });
  });

  it("falha de rede volta para a fila com espera e para depois do limite", async () => {
    await reset();
    await connect(["trf1-1g"]);
    const t0 = new Date();
    let job = (await claimNextJob(t0))!;
    await runJob(job.id, depsFor(bad("NETWORK", true), () => t0));
    const queued = await db.robotJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(queued).toMatchObject({ status: "QUEUED", attempts: 1 });
    expect(queued.runAfter.getTime()).toBeGreaterThan(t0.getTime() + 60_000);
    expect(await claimNextJob(t0)).toBeNull();
    let t = new Date(t0.getTime() + 60 * 60_000);
    for (let i = 2; i <= MAX_ATTEMPTS; i++) {
      job = (await claimNextJob(t))!;
      await runJob(job.id, depsFor(bad("NETWORK", true), () => t));
      t = new Date(t.getTime() + 60 * 60_000);
    }
    expect(await db.robotJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "FAILED", attempts: MAX_ATTEMPTS });
    expect((await db.portalAccess.findFirstOrThrow({ where: { organizationId: a.org.id } })).status).toBe("ERROR");
  });

  it("retoma o que ficou 'rodando' depois de uma queda", async () => {
    await reset();
    await connect(["trf1-1g"]);
    const job = (await claimNextJob())!;
    await db.robotJob.update({ where: { id: job.id }, data: { startedAt: new Date(Date.now() - 20 * 60_000) } });
    expect(await recoverStuckJobs()).toBe(1);
    expect((await db.robotJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("QUEUED");
  });

  it("agendador fica desligado por padrão e, ligado, não duplica trabalho", async () => {
    await reset();
    await connect(["trf1-1g"]);
    const job = (await claimNextJob())!;
    await runJob(job.id, depsFor(ok));
    delete process.env.ROBOT_SYNC_ENABLED;
    expect(await enqueueDueSyncs()).toMatchObject({ enabled: false, queued: 0 });
    process.env.ROBOT_SYNC_ENABLED = "1";
    try {
      expect(await enqueueDueSyncs()).toMatchObject({ enabled: true, queued: 1 });
      expect(await enqueueDueSyncs()).toMatchObject({ queued: 0 });
      const sync = (await claimNextJob())!;
      expect(await runJob(sync.id, depsFor(ok))).toEqual({ status: "DONE" });
      const done = await db.robotJob.findUniqueOrThrow({ where: { id: sync.id } });
      expect(done.kind).toBe("SYNC_NOTICES");
      expect(JSON.stringify(done.summary)).not.toContain(PASSWORD);
      expect((await db.portalAccess.findFirstOrThrow({ where: { organizationId: a.org.id } })).lastSyncAt).not.toBeNull();
    } finally {
      delete process.env.ROBOT_SYNC_ENABLED;
    }
  });

  it("cada pessoa vê e mexe só nos próprios acessos", async () => {
    await reset();
    await connect(["trf1-1g"]);
    const other = await addMember(a.org.id, "LAWYER", "outro");
    expect(await listMyPortalAccesses(other.ctx)).toHaveLength(0);
    const access = await db.portalAccess.findFirstOrThrow({ where: { organizationId: a.org.id } });
    await expect(deletePortalAccess(other.ctx, access.id)).rejects.toThrow();
    await expect(setPortalAccessEnabled(other.ctx, access.id, false)).rejects.toThrow();
    await deletePortalAccess(a.ctx, access.id);
    expect(await db.portalAccess.count({ where: { id: access.id } })).toBe(0);
  });
});
