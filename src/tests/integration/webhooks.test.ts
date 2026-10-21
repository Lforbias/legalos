import { createHmac } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as cronPost } from "@/app/api/cron/webhooks/route";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { totpCode, totpStep } from "@/lib/security/totp";
import { assertWebhookUrl, postWebhook, signPayload } from "@/lib/webhooks/transport";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { createNotice } from "@/server/services/notice.service";
import { createWebhook, deleteWebhook, emitWebhookEvent, listWebhooks, retryDelivery, runWebhookDeliveries, setWebhookEnabled, testWebhook } from "@/server/services/webhook.service";
import { META, addMember, makeOrgWithOwner } from "./helpers";

async function enableMfaFor(userId: string, email: string) {
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  const s = await startEnrollment(userId, email);
  await confirmEnrollment(userId, totpCode(s.secret, totpStep()), META);
}

type Hit = { headers: http.IncomingHttpHeaders; body: string };

describe("webhooks", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let server: http.Server;
  let url: string;
  let respondWith = 200;
  const hits: Hit[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        hits.push({ headers: req.headers, body: Buffer.concat(chunks).toString("utf8") });
        res.statusCode = respondWith;
        res.end("ok");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
    A = await makeOrgWithOwner("wh-A");
    B = await makeOrgWithOwner("wh-B");
    for (const o of [A, B]) {
      const u = await db.user.findUniqueOrThrow({ where: { id: o.ctx.userId } });
      await enableMfaFor(u.id, u.email);
    }
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const noticeInput = (title: string) => ({ source: "MANUAL" as const, kind: "INTIMACAO" as const, title, content: `Conteúdo sigiloso da intimação ${title} suficiente.`, caseNumber: "", court: "", publishedAt: "", receivedAt: "2026-10-16", caseId: "" });

  it("criação: permissão, 2FA, validações e segredo mostrado só uma vez (cifrado no banco)", async () => {
    const lawyer = await addMember(A.org.id, "LAWYER", "wh-law");
    await expect(createWebhook(lawyer.ctx, { name: "xyz", url, events: ["notice.created"] })).rejects.toBeInstanceOf(ForbiddenError);
    const noMfa = await makeOrgWithOwner("wh-nomfa");
    await expect(createWebhook(noMfa.ctx, { name: "xyz", url, events: ["notice.created"] })).rejects.toBeInstanceOf(ConflictError);
    await expect(createWebhook(A.ctx, { name: "ab", url, events: ["notice.created"] })).rejects.toBeInstanceOf(ValidationError);
    await expect(createWebhook(A.ctx, { name: "valido", url: "isto-nao-e-url", events: ["notice.created"] })).rejects.toBeInstanceOf(ValidationError);
    await expect(createWebhook(A.ctx, { name: "valido", url, events: [] })).rejects.toBeInstanceOf(ValidationError);
    await expect(createWebhook(A.ctx, { name: "valido", url, events: ["x.y"] })).rejects.toBeInstanceOf(ValidationError);
    const w = await createWebhook(A.ctx, { name: "Principal", url, events: ["notice.created", "case.created"] });
    expect(w.secret).toMatch(/^whsec_/);
    const row = await db.webhookEndpoint.findUniqueOrThrow({ where: { id: w.id } });
    expect(row.secretEnc).not.toContain(w.secret);
    expect(JSON.stringify(await listWebhooks(A.ctx))).not.toContain(w.secret);
    await expect(listWebhooks(lawyer.ctx)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("evento vira entrega só para quem assinou, só no próprio escritório; carga só tem identificadores", async () => {
    await db.webhookEndpoint.updateMany({ where: { organizationId: A.org.id }, data: { deletedAt: new Date() } });
    const only = await createWebhook(A.ctx, { name: "Só processos", url, events: ["case.created"] });
    const both = await createWebhook(A.ctx, { name: "Intimações", url, events: ["notice.created"] });
    await createWebhook(B.ctx, { name: "Do B", url, events: ["notice.created"] });
    const n = await createNotice(A.ctx, noticeInput("Segredo-123"));
    const ds = await db.webhookDelivery.findMany({ where: { organizationId: A.org.id } });
    expect(ds).toHaveLength(1);
    expect(ds[0]!.endpointId).toBe(both.id);
    expect(ds[0]!.endpointId).not.toBe(only.id);
    const payload = ds[0]!.payload as { type: string; data: { noticeId: string } };
    expect(payload.type).toBe("notice.created");
    expect(payload.data.noticeId).toBe(n.id);
    expect(JSON.stringify(payload)).not.toContain("Segredo-123");
    expect(JSON.stringify(payload)).not.toContain("sigiloso");
    expect(await db.webhookDelivery.count({ where: { organizationId: B.org.id } })).toBe(0);
    // duplicata não gera novo aviso
    await createNotice(A.ctx, noticeInput("Segredo-123"));
    expect(await db.webhookDelivery.count({ where: { organizationId: A.org.id } })).toBe(1);
  });

  it("entrega: corpo, cabeçalhos e assinatura HMAC conferem; fica SUCCEEDED; rota do agendador exige segredo", async () => {
    await db.webhookEndpoint.updateMany({ where: { organizationId: A.org.id }, data: { deletedAt: new Date() } });
    await db.webhookDelivery.deleteMany({ where: { organizationId: A.org.id } });
    const w = await createWebhook(A.ctx, { name: "Entrega", url, events: ["notice.created"] });
    hits.length = 0;
    await createNotice(A.ctx, noticeInput("Entrega-1"));
    process.env.CRON_SECRET = "segredo-de-teste-com-mais-de-24-chars";
    const denied = await cronPost(new Request("http://localhost/api/cron/webhooks", { method: "POST", headers: { authorization: "Bearer errado" } }));
    expect(denied.status).toBe(401);
    const ok = await cronPost(new Request("http://localhost/api/cron/webhooks", { method: "POST", headers: { authorization: "Bearer segredo-de-teste-com-mais-de-24-chars" } }));
    delete process.env.CRON_SECRET;
    expect(ok.status).toBe(200);
    expect(hits).toHaveLength(1);
    const h = hits[0]!;
    const sig = String(h.headers["x-legalos-signature"]);
    const t = /t=(\d+)/.exec(sig)![1]!;
    const v1 = /v1=([0-9a-f]+)/.exec(sig)![1]!;
    expect(Math.abs(Date.now() / 1000 - Number(t))).toBeLessThan(30);
    expect(h.headers["x-legalos-event"]).toBe("notice.created");
    expect(h.headers["content-type"]).toContain("application/json");
    const row = await db.webhookEndpoint.findUniqueOrThrow({ where: { id: w.id } });
    expect(v1).toBe(createHmac("sha256", w.secret).update(`${t}.${h.body}`).digest("hex"));
    expect(sig).toBe(signPayload(w.secret, h.body, Number(t)));
    expect(JSON.parse(h.body).type).toBe("notice.created");
    expect(row.lastSuccessAt).not.toBeNull();
    const d = await db.webhookDelivery.findFirstOrThrow({ where: { endpointId: w.id } });
    expect(d.status).toBe("SUCCEEDED");
    expect(d.attempts).toBe(1);
    expect(h.headers["x-legalos-delivery"]).toBe(d.id);
  });

  it("falha → reagenda com espera; ao esgotar 6 tentativas fica FAILED; reenvio manual volta a PENDING; disparo não repete antes da hora", async () => {
    await db.webhookEndpoint.updateMany({ where: { organizationId: A.org.id }, data: { deletedAt: new Date() } });
    const w = await createWebhook(A.ctx, { name: "Instável", url, events: ["notice.created"] });
    respondWith = 500;
    await createNotice(A.ctx, noticeInput("Falha-1"));
    const r1 = await runWebhookDeliveries();
    expect(r1.claimed).toBe(1);
    expect(r1.retrying).toBe(1);
    let d = await db.webhookDelivery.findFirstOrThrow({ where: { endpointId: w.id } });
    expect(d.status).toBe("PENDING");
    expect(d.attempts).toBe(1);
    expect(d.lastStatusCode).toBe(500);
    expect(d.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 30_000);
    expect((await runWebhookDeliveries()).claimed).toBe(0);
    for (let i = 0; i < 5; i++) {
      await db.webhookDelivery.update({ where: { id: d.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
      await runWebhookDeliveries();
    }
    d = await db.webhookDelivery.findUniqueOrThrow({ where: { id: d.id } });
    expect(d.status).toBe("FAILED");
    expect(d.attempts).toBe(6);
    respondWith = 200;
    await retryDelivery(A.ctx, d.id);
    await expect(retryDelivery(A.ctx, d.id)).rejects.toBeInstanceOf(NotFoundError);
    const r2 = await runWebhookDeliveries();
    expect(r2.succeeded).toBe(1);
    expect((await db.webhookDelivery.findUniqueOrThrow({ where: { id: d.id } })).status).toBe("SUCCEEDED");
    expect((await db.webhookEndpoint.findUniqueOrThrow({ where: { id: w.id } })).consecutiveFailures).toBe(0);
  });

  it("teste manual (ping) mostra sucesso e falha; 30 falhas seguidas desligam o webhook; religar zera", async () => {
    await db.webhookEndpoint.updateMany({ where: { organizationId: A.org.id }, data: { deletedAt: new Date() } });
    const w = await createWebhook(A.ctx, { name: "Teste", url, events: ["notice.created"] });
    respondWith = 200;
    expect(await testWebhook(A.ctx, w.id)).toMatchObject({ ok: true, statusCode: 200 });
    respondWith = 503;
    const bad = await testWebhook(A.ctx, w.id);
    expect(bad.ok).toBe(false);
    expect(bad.statusCode).toBe(503);
    // o teste que falha não fica na fila de reenvio automático
    expect(await db.webhookDelivery.count({ where: { endpointId: w.id, status: "PENDING" } })).toBe(0);
    await db.webhookEndpoint.update({ where: { id: w.id }, data: { consecutiveFailures: 29 } });
    await testWebhook(A.ctx, w.id);
    const off = await db.webhookEndpoint.findUniqueOrThrow({ where: { id: w.id } });
    expect(off.enabled).toBe(false);
    expect(off.disabledReason).toMatch(/automaticamente/);
    expect(await emitWebhookEvent(A.org.id, "notice.created", { x: 1 })).toBe(0);
    await setWebhookEnabled(A.ctx, w.id, true);
    expect((await db.webhookEndpoint.findUniqueOrThrow({ where: { id: w.id } })).consecutiveFailures).toBe(0);
    respondWith = 200;
    await expect(testWebhook(B.ctx, w.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("remover cancela pendentes; outro escritório não mexe; escritório suspenso não recebe", async () => {
    await db.webhookEndpoint.updateMany({ where: { organizationId: A.org.id }, data: { deletedAt: new Date() } });
    const w = await createWebhook(A.ctx, { name: "Remover", url, events: ["notice.created"] });
    await createNotice(A.ctx, noticeInput("Pendente-1"));
    await expect(deleteWebhook(B.ctx, w.id)).rejects.toBeInstanceOf(NotFoundError);
    await deleteWebhook(A.ctx, w.id);
    const d = await db.webhookDelivery.findFirstOrThrow({ where: { endpointId: w.id } });
    expect(d.status).toBe("FAILED");
    expect(await emitWebhookEvent(A.org.id, "notice.created", {})).toBe(0);

    const S = await makeOrgWithOwner("wh-susp");
    const u = await db.user.findUniqueOrThrow({ where: { id: S.ctx.userId } });
    await enableMfaFor(u.id, u.email);
    await createWebhook(S.ctx, { name: "Suspenso", url, events: ["notice.created"] });
    await createNotice(S.ctx, noticeInput("Susp-1"));
    await db.organization.update({ where: { id: S.org.id }, data: { suspendedAt: new Date(), suspendedReason: "teste" } });
    hits.length = 0;
    await runWebhookDeliveries();
    expect(hits).toHaveLength(0);
    expect(await db.webhookDelivery.count({ where: { organizationId: S.org.id, status: "PENDING" } })).toBe(1);
  });

  it("segurança do endereço: em produção só https com nome de domínio público; sem usuário/senha; IP e localhost recusados", async () => {
    const env = process.env as Record<string, string | undefined>;
    const prev = env.NODE_ENV;
    env.NODE_ENV = "production";
    try {
      expect(() => assertWebhookUrl("http://exemplo.com.br/x")).toThrow();
      expect(() => assertWebhookUrl("https://user:senha@exemplo.com.br/x")).toThrow();
      expect(() => assertWebhookUrl("https://127.0.0.1/x")).toThrow();
      expect(() => assertWebhookUrl("https://169.254.169.254/latest")).toThrow();
      expect(() => assertWebhookUrl("https://localhost/x")).toThrow();
      expect(() => assertWebhookUrl("https://intranet/x")).toThrow();
      expect(() => assertWebhookUrl("https://servidor.internal/x")).toThrow();
      expect(() => assertWebhookUrl("https://exemplo.com.br/x")).not.toThrow();
      const r = await postWebhook("https://127.0.0.1:1/x", "{}", {});
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/IP|domínio/);
    } finally {
      env.NODE_ENV = prev;
    }
  });
});
