import net from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { SMTPServer } from "smtp-server";
import { db } from "@/lib/db/client";
import { renderMail } from "@/lib/mail/layout";
import { enqueueMail, mailQueueStats, runMailOutbox } from "@/server/services/mail-outbox.service";
import { runBillingSweep } from "@/server/services/billing.service";
import { makeOrgWithOwner } from "./helpers";

type Got = { to: string[]; raw: string };
const received: Got[] = [];
let server: SMTPServer;
let port = 0;
let reject = false;
const saved = { ...process.env };
const qp = (raw: string) => raw.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
const useSmtp = () => Object.assign(process.env, { MAIL_DRIVER: "smtp", SMTP_HOST: "127.0.0.1", SMTP_PORT: String(port), MAIL_FROM: "LegalOS <nao-responda@exemplo.test>", SMTP_ALLOW_PLAIN: "1" });
const clean = () => db.mailOutbox.deleteMany({});

beforeAll(async () => {
  server = new SMTPServer({
    disabledCommands: ["STARTTLS", "AUTH"],
    authOptional: true,
    onData(stream, session, cb) {
      let raw = "";
      stream.on("data", (c) => (raw += c.toString()));
      stream.on("end", () => {
        if (reject) return cb(new Error("451 caixa cheia, tente depois"));
        received.push({ to: session.envelope.rcptTo.map((r) => r.address), raw });
        cb();
      });
    },
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.server.address() as net.AddressInfo).port;
});
afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });
afterEach(async () => {
  for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  Object.assign(process.env, saved);
  received.length = 0;
  reject = false;
  await clean();
});

describe("fila de e-mails (SMTP real local)", () => {
  it("sem driver real não enfileira nem marca como enviado", async () => {
    delete process.env.MAIL_DRIVER;
    expect(await enqueueMail({ kind: "t", to: "a@exemplo.test", subject: "x", text: "y" })).toEqual({ queued: false, reason: "driver" });
    expect((await runMailOutbox()).skipped).toBe(true);
    expect(await db.mailOutbox.count()).toBe(0);
  });

  it("entrega HTML + texto, só uma vez por chave de deduplicação, e rejeita endereço inválido", async () => {
    useSmtp();
    const m = renderMail({ title: "Pagamento <confirmado>", paragraphs: ["Valor R$ 99,00 & obrigado"], button: { label: "Abrir", url: "https://app.exemplo.test/configuracoes" } });
    expect(m.html).toContain("Pagamento &lt;confirmado&gt;");
    expect(m.html).not.toContain("<confirmado>");
    expect((await enqueueMail({ kind: "t", to: "dra@exemplo.test", subject: "Pagamento confirmado", text: m.text, html: m.html, dedupeKey: "k1" })).queued).toBe(true);
    expect(await enqueueMail({ kind: "t", to: "dra@exemplo.test", subject: "Pagamento confirmado", text: m.text, dedupeKey: "k1" })).toEqual({ queued: false, reason: "duplicate" });
    expect(await enqueueMail({ kind: "t", to: "nao-e-email", subject: "x", text: "y" })).toEqual({ queued: false, reason: "invalid_email" });
    expect(await enqueueMail({ kind: "t", to: "a@exemplo.test", subject: "linha1\nBcc: x@y.z", text: "y" })).toEqual({ queued: false, reason: "invalid_email" });
    const r = await runMailOutbox();
    expect(r).toMatchObject({ claimed: 1, sent: 1, failed: 0 });
    expect(received).toHaveLength(1);
    const raw = qp(received[0]!.raw);
    expect(raw).toMatch(/Content-Type: text\/html/);
    expect(raw).toContain("https://app.exemplo.test/configuracoes");
    expect((await runMailOutbox()).claimed).toBe(0); // não reenvia o que já foi
    expect((await mailQueueStats()).sent24h).toBe(1);
  });

  it("falha do servidor: tenta de novo com espera e desiste após 6 tentativas", async () => {
    useSmtp();
    reject = true;
    await enqueueMail({ kind: "t", to: "dra@exemplo.test", subject: "x", text: "y" });
    const r1 = await runMailOutbox();
    expect(r1).toMatchObject({ claimed: 1, retrying: 1, sent: 0 });
    const row = await db.mailOutbox.findFirstOrThrow();
    expect(row.status).toBe("PENDING");
    expect(row.attempts).toBe(1);
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 60_000);
    expect(row.lastError).toBeTruthy();
    expect((await runMailOutbox()).claimed).toBe(0); // ainda em espera
    // servidor volta: libera a espera
    reject = false;
    await db.mailOutbox.update({ where: { id: row.id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
    expect((await runMailOutbox()).sent).toBe(1);
    // desistência
    reject = true;
    await enqueueMail({ kind: "t", to: "dra@exemplo.test", subject: "z", text: "z" });
    const r2 = await db.mailOutbox.findFirstOrThrow({ where: { status: "PENDING" } });
    await db.mailOutbox.update({ where: { id: r2.id }, data: { attempts: 5 } });
    expect((await runMailOutbox()).failed).toBe(1);
    expect((await db.mailOutbox.findUniqueOrThrow({ where: { id: r2.id } })).status).toBe("FAILED");
    expect((await mailQueueStats()).failed).toBe(1);
  });

  it("e-mails enviados há mais de 30 dias são apagados", async () => {
    useSmtp();
    await db.mailOutbox.create({ data: { kind: "t", toEmail: "a@exemplo.test", subject: "velho", textBody: "x", status: "SENT", sentAt: new Date(Date.now() - 31 * 86_400_000) } });
    expect((await runMailOutbox()).purged).toBe(1);
  });
});

describe("avisos de cobrança por e-mail", () => {
  it("lembra do fim do teste uma única vez e avisa quando o teste terminou", async () => {
    useSmtp();
    const A = await makeOrgWithOwner("mail-trial");
    await db.subscription.update({ where: { organizationId: A.org.id }, data: { status: "TRIALING", trialEndsAt: new Date(Date.now() + 2 * 86_400_000) } });
    const s1 = await runBillingSweep();
    expect(s1.trialReminders).toBeGreaterThanOrEqual(1);
    const mine = await db.mailOutbox.findMany({ where: { organizationId: A.org.id } });
    expect(mine.map((m) => m.toEmail)).toContain(A.owner.email.toLowerCase());
    expect(mine[0]!.subject).toMatch(/período de teste.*terminando/);
    await runBillingSweep(); // de novo: não duplica
    expect(await db.mailOutbox.count({ where: { organizationId: A.org.id } })).toBe(mine.length);
    await runMailOutbox();
    expect(received.some((r) => qp(r.raw).includes("termina em"))).toBe(true);

    await db.subscription.update({ where: { organizationId: A.org.id }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
    const s2 = await runBillingSweep();
    expect(s2.trialExpired).toBeGreaterThanOrEqual(1);
    expect((await db.mailOutbox.findMany({ where: { organizationId: A.org.id, kind: "billing.trial_expired" } })).length).toBeGreaterThanOrEqual(1);
  });

  it("administrador sem permissão de cobrança não recebe aviso de cobrança", async () => {
    useSmtp();
    const A = await makeOrgWithOwner("mail-perm");
    const adm = await (await import("./helpers")).addMember(A.org.id, "ADMIN", "mail-adm");
    await db.subscription.update({ where: { organizationId: A.org.id }, data: { status: "TRIALING", trialEndsAt: new Date(Date.now() + 86_400_000) } });
    await runBillingSweep();
    const to = (await db.mailOutbox.findMany({ where: { organizationId: A.org.id } })).map((m) => m.toEmail);
    expect(to).toContain(A.owner.email.toLowerCase());
    expect(to).not.toContain(adm.user.email.toLowerCase());
  });
});
