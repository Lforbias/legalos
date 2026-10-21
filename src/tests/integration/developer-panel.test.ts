import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { totpCode, totpStep } from "@/lib/security/totp";
import { sanitizeError, withJobRun } from "@/server/job-runs";
import {
  apiOverview, errorsOverview, jobsOverview, recentJobRuns, retryDeliveryAsPlatform, retryMailAsPlatform, runJobManually,
  switchOffForOrganization, switchesOverview, systemOverview, testIntegration,
} from "@/server/services/developer.service";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import type { PlatformCtx } from "@/server/services/platform.service";
import { META, makeOrgWithOwner, makeUser } from "./helpers";

describe("painel do developer", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let pc: PlatformCtx;
  let bad: PlatformCtx;
  const endpointIds: string[] = [];

  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    A = await makeOrgWithOwner("dev-A");
    const admin = await makeUser("dev-admin");
    const s = await startEnrollment(admin.id, admin.email);
    await confirmEnrollment(admin.id, totpCode(s.secret, totpStep()), META);
    await db.platformAdmin.create({ data: { userId: admin.id } });
    pc = { userId: admin.id, meta: META };
    const stranger = await makeUser("dev-stranger");
    bad = { userId: stranger.id, meta: META };
  });

  afterAll(async () => {
    await db.webhookEndpoint.deleteMany({ where: { id: { in: endpointIds } } });
    await db.mailOutbox.deleteMany({ where: { kind: "dev-test" } });
    await db.jobRun.deleteMany({ where: { job: "billing" } });
  });

  it("só o dono (super-admin com 2FA) usa qualquer função do painel", async () => {
    const calls: (() => Promise<unknown>)[] = [
      () => jobsOverview(bad), () => recentJobRuns(bad), () => systemOverview(bad), () => apiOverview(bad), () => errorsOverview(bad), () => switchesOverview(bad),
      () => runJobManually(bad, "webhooks"), () => testIntegration(bad, "database"), () => retryDeliveryAsPlatform(bad, randomUUID()), () => retryMailAsPlatform(bad, randomUUID()),
      () => switchOffForOrganization(bad, A.org.id, "ai"),
    ];
    for (const c of calls) await expect(c()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("registra execuções com contagens e mascara erros (e-mail e documentos)", async () => {
    const r = await withJobRun("webhooks", "MANUAL", async () => ({ claimed: 3, succeeded: 2, texto: "ignorado" }));
    expect(r.claimed).toBe(3);
    const ok = await db.jobRun.findFirst({ where: { job: "webhooks", trigger: "MANUAL", status: "OK" }, orderBy: { startedAt: "desc" } });
    expect(ok?.summary).toEqual({ claimed: 3, succeeded: 2 });
    expect(ok?.durationMs).not.toBeNull();

    await expect(withJobRun("mail", "CRON", async () => { throw new Error("falha para maria@exemplo.com cpf 123.456.789-09"); })).rejects.toThrow();
    const badRun = await db.jobRun.findFirst({ where: { job: "mail", status: "ERROR" }, orderBy: { startedAt: "desc" } });
    expect(badRun?.error).toContain("[e-mail]");
    expect(badRun?.error).toContain("[número]");
    expect(badRun?.error).not.toContain("maria@");
    expect(badRun?.error).not.toContain("123.456");
    const err = await db.appError.findFirst({ where: { source: "rotina:mail" }, orderBy: { createdAt: "desc" } });
    expect(err?.message).not.toContain("maria@");
    expect(sanitizeError(new Error("x".repeat(1000))).length).toBeLessThanOrEqual(240);
  });

  it("situação das rotinas: nunca rodou, em dia e atrasada", async () => {
    await db.jobRun.deleteMany({ where: { job: "billing" } });
    expect((await jobsOverview(pc)).jobs.find((j) => j.key === "billing")?.state).toBe("never");
    const old = new Date(Date.now() - 3 * 3_600_000);
    await db.jobRun.create({ data: { job: "billing", status: "OK", startedAt: old, finishedAt: old, durationMs: 5 } });
    expect((await jobsOverview(pc)).jobs.find((j) => j.key === "billing")?.state).toBe("stale");
    await db.jobRun.create({ data: { job: "billing", status: "OK", finishedAt: new Date(), durationMs: 7 } });
    expect((await jobsOverview(pc)).jobs.find((j) => j.key === "billing")?.state).toBe("ok");
    await db.jobRun.create({ data: { job: "billing", status: "ERROR", error: "boom", finishedAt: new Date(), durationMs: 1 } });
    const j = (await jobsOverview(pc)).jobs.find((x) => x.key === "billing")!;
    expect(j.state).toBe("error");
    expect(j.lastError).toBe("boom");
  });

  it("disparo manual: só rotinas liberadas, uma por vez, e auditado", async () => {
    await expect(runJobManually(pc, "billing")).rejects.toBeInstanceOf(ValidationError);
    await expect(runJobManually(pc, "whatsapp-billing")).rejects.toBeInstanceOf(ValidationError);
    await expect(runJobManually(pc, "qualquer")).rejects.toBeInstanceOf(ValidationError);
    const r = await runJobManually(pc, "webhooks");
    expect(r.ok).toBe(true);
    expect(await db.auditLog.count({ where: { action: "platform.job_run", userId: pc.userId } })).toBeGreaterThan(0);
    await db.jobRun.deleteMany({ where: { job: "mail", status: "RUNNING" } });
    await db.jobRun.create({ data: { job: "mail", trigger: "CRON", status: "RUNNING" } });
    await expect(runJobManually(pc, "mail")).rejects.toBeInstanceOf(ConflictError);
    await db.jobRun.deleteMany({ where: { job: "mail", status: "RUNNING" } });
  });

  it("API e webhooks: mostra falhas sem vazar segredo nem caminho da URL; reenvio recoloca na fila", async () => {
    const ep = await db.webhookEndpoint.create({ data: { organizationId: A.org.id, name: "ERP", url: "https://erp.exemplo.com/hook/SEGREDO-NO-CAMINHO?t=abc", secretEnc: "SEGREDO-CIFRADO", events: ["notice.created"], consecutiveFailures: 4 } });
    endpointIds.push(ep.id);
    const d = await db.webhookDelivery.create({ data: { organizationId: A.org.id, endpointId: ep.id, eventId: randomUUID(), eventType: "notice.created", payload: { conteudo: "SIGILO-DO-CLIENTE" }, status: "FAILED", attempts: 8, lastStatusCode: 500, lastError: "falha com ana@cliente.com" } });
    const a = await apiOverview(pc);
    const json = JSON.stringify(a);
    expect(json).not.toContain("SEGREDO-NO-CAMINHO");
    expect(json).not.toContain("SEGREDO-CIFRADO");
    expect(json).not.toContain("SIGILO-DO-CLIENTE");
    expect(json).not.toContain("ana@cliente.com");
    expect(a.webhooks.problems.some((p) => p.host === "erp.exemplo.com")).toBe(true);
    const f = a.webhooks.failedDeliveries.find((x) => x.id === d.id);
    expect(f?.retryable).toBe(true);
    await retryDeliveryAsPlatform(pc, d.id);
    expect((await db.webhookDelivery.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("PENDING");
    await expect(retryDeliveryAsPlatform(pc, d.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.auditLog.count({ where: { action: "platform.webhook_retry", organizationId: A.org.id } })).toBe(1);
  });

  it("fila de e-mails: lista só tipo e erro mascarado (sem destinatário) e permite reenviar", async () => {
    const m = await db.mailOutbox.create({ data: { kind: "dev-test", toEmail: "cliente-sigiloso@exemplo.com", subject: "ASSUNTO-SIGILOSO", textBody: "x", status: "FAILED", attempts: 5, lastError: "recusou cliente-sigiloso@exemplo.com" } });
    const a = await apiOverview(pc);
    const json = JSON.stringify(a.mail);
    expect(json).not.toContain("cliente-sigiloso");
    expect(json).not.toContain("ASSUNTO-SIGILOSO");
    expect(a.mail.failed.some((x) => x.id === m.id)).toBe(true);
    await retryMailAsPlatform(pc, m.id);
    expect((await db.mailOutbox.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("PENDING");
  });

  it("testes de integração: respondem ok/tempo/mensagem, são auditados e têm limite de repetição", async () => {
    await expect(testIntegration(pc, "inexistente")).rejects.toBeInstanceOf(ValidationError);
    const dbT = await testIntegration(pc, "database");
    expect(dbT.ok).toBe(true);
    expect(typeof dbT.ms).toBe("number");
    await expect(testIntegration(pc, "database")).rejects.toBeInstanceOf(ConflictError);
    expect((await testIntegration(pc, "storage")).ok).toBe(true);
    const smtp = await testIntegration(pc, "smtp");
    expect(smtp.ok).toBe(false); // MAIL_DRIVER não é smtp nos testes: nunca finge sucesso
    expect(smtp.message.length).toBeGreaterThan(5);
    expect(await db.auditLog.count({ where: { action: "platform.integration_test", userId: pc.userId } })).toBeGreaterThanOrEqual(3);
  });

  it("interruptores: o dono só desliga (e fica auditado); religar é do escritório", async () => {
    await db.organization.update({ where: { id: A.org.id }, data: { aiEnabled: true, datajudEnabled: true } });
    await db.whatsappBillingSettings.upsert({ where: { organizationId: A.org.id }, create: { organizationId: A.org.id, enabled: true }, update: { enabled: true } });
    let row = (await switchesOverview(pc)).find((o) => o.id === A.org.id)!;
    expect(row.on.ai && row.on.datajud && row.on.billing).toBe(true);
    await expect(switchOffForOrganization(pc, A.org.id, "automations")).rejects.toBeInstanceOf(ValidationError);
    await expect(switchOffForOrganization(pc, randomUUID(), "ai")).rejects.toBeInstanceOf(NotFoundError);
    expect((await switchOffForOrganization(pc, A.org.id, "ai")).changed).toBe(1);
    expect((await switchOffForOrganization(pc, A.org.id, "billing")).changed).toBe(1);
    expect((await switchOffForOrganization(pc, A.org.id, "billing")).changed).toBe(0);
    row = (await switchesOverview(pc)).find((o) => o.id === A.org.id)!;
    expect(row.on.ai).toBe(false);
    expect(row.on.billing).toBe(false);
    expect(row.on.datajud).toBe(true);
    expect(await db.auditLog.count({ where: { action: "platform.switch_off", organizationId: A.org.id } })).toBe(3);
  });

  it("erros: agrupa por mensagem e mostra ações do administrador", async () => {
    await db.appError.createMany({ data: [{ source: "ação", message: "Erro-de-teste-dev" }, { source: "ação", message: "Erro-de-teste-dev" }] });
    const e = await errorsOverview(pc);
    expect(e.groups.find((g) => g.message === "Erro-de-teste-dev")?.count).toBe(2);
    expect(e.platformActions.some((a) => a.action.startsWith("platform."))).toBe(true);
    await db.appError.deleteMany({ where: { message: "Erro-de-teste-dev" } });
  });
});
