import net from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { SMTPServer } from "smtp-server";
import { getMailer, sendMailSafe, smtpConfigFromEnv } from "@/lib/mail/mailer";
import { createInvitation } from "@/server/services/invitation.service";
import { makeOrgWithOwner, roleByKey } from "./helpers";

// Servidor SMTP REAL local (sem TLS: só para teste, com SMTP_ALLOW_PLAIN=1). Confere o que de fato chega pela rede.
type Got = { from: string; to: string[]; raw: string; user?: string };
const received: Got[] = [];
let server: SMTPServer;
let port = 0;
const saved = { ...process.env };

/** Decodifica quoted-printable (como o cliente de e-mail faz) para conferir o texto que o destinatário lê. */
const qp = (raw: string) => raw.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
function useSmtp(p = port, extra: Record<string, string> = {}) {
  Object.assign(process.env, { MAIL_DRIVER: "smtp", SMTP_HOST: "127.0.0.1", SMTP_PORT: String(p), MAIL_FROM: "LegalOS <nao-responda@exemplo.test>", SMTP_ALLOW_PLAIN: "1", ...extra });
}
async function freePort() {
  return new Promise<number>((res) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); }); });
}

beforeAll(async () => {
  server = new SMTPServer({
    disabledCommands: ["STARTTLS"],
    allowInsecureAuth: true,
    authOptional: true,
    onAuth(auth, _s, cb) { if (auth.username === "u" && auth.password === "p") cb(null, { user: "u" }); else cb(new Error("Credenciais inválidas")); },
    onData(stream, session, cb) {
      let raw = "";
      stream.on("data", (c) => (raw += c.toString()));
      stream.on("end", () => { received.push({ from: session.envelope.mailFrom ? session.envelope.mailFrom.address : "", to: session.envelope.rcptTo.map((r) => r.address), raw, user: (session.user as string | undefined) }); cb(); });
    },
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.server.address() as net.AddressInfo).port;
});
afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });
afterEach(() => { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); received.length = 0; });

describe("e-mail por SMTP", () => {
  it("entrega de verdade: remetente, destinatário, assunto e corpo chegam ao servidor", async () => {
    useSmtp();
    const m = getMailer();
    expect(m.delivers).toBe(true);
    await m.send({ to: "dra@exemplo.test", subject: "Convite — LegalOS", text: "Aceite em: https://x.test/a?token=abc" });
    expect(received).toHaveLength(1);
    expect(received[0]!.from).toBe("nao-responda@exemplo.test");
    expect(received[0]!.to).toEqual(["dra@exemplo.test"]);
    expect(qp(received[0]!.raw)).toContain("token=abc");
    expect(received[0]!.raw).toMatch(/Subject: (Convite|=\?UTF-8\?Q\?Convite)/);
  });

  it("autentica quando há usuário/senha e falha com senha errada sem derrubar quem chama", async () => {
    useSmtp(port, { SMTP_USER: "u", SMTP_PASS: "p" });
    await getMailer().send({ to: "a@exemplo.test", subject: "ok", text: "x" });
    expect(received[0]!.user).toBe("u");
    useSmtp(port, { SMTP_USER: "u", SMTP_PASS: "errada" });
    await expect(getMailer().send({ to: "a@exemplo.test", subject: "x", text: "x" })).rejects.toThrow();
    const r = await sendMailSafe({ to: "a@exemplo.test", subject: "x", text: "x" });
    expect(r.delivered).toBe(false);
  });

  it("servidor fora do ar: sendMailSafe não lança e diz que não entregou", async () => {
    useSmtp(await freePort());
    expect(await sendMailSafe({ to: "a@exemplo.test", subject: "x", text: "x" })).toEqual({ delivered: false });
  });

  it("recusa quebra de linha em destinatário/assunto (injeção de cabeçalho)", async () => {
    useSmtp();
    await expect(getMailer().send({ to: "a@exemplo.test\r\nBcc: x@y.test", subject: "x", text: "x" })).rejects.toThrow(/inválido/);
    await expect(getMailer().send({ to: "a@exemplo.test", subject: "x\nBcc: x@y.test", text: "x" })).rejects.toThrow(/inválido/);
    expect(received).toHaveLength(0);
  });

  it("configuração incompleta nunca finge entrega", () => {
    useSmtp();
    delete process.env.SMTP_HOST;
    const m = getMailer();
    expect(m.delivers).toBe(false);
    expect(m.name).toBe("console");
    expect(smtpConfigFromEnv({ SMTP_HOST: "h", MAIL_FROM: "invalido" }).error).toMatch(/MAIL_FROM/);
    expect(smtpConfigFromEnv({ SMTP_HOST: "h", MAIL_FROM: "a@b.co", SMTP_USER: "u" }).error).toMatch(/SMTP_USER/);
    expect(smtpConfigFromEnv({ SMTP_HOST: "h", MAIL_FROM: "a@b.co", SMTP_PORT: "0" }).error).toMatch(/SMTP_PORT/);
    expect(smtpConfigFromEnv({ SMTP_HOST: "h", MAIL_FROM: "a@b.co" }).config).toMatchObject({ port: 587, secure: false });
    expect(smtpConfigFromEnv({ SMTP_HOST: "h", MAIL_FROM: "a@b.co", SMTP_SECURE: "true" }).config).toMatchObject({ port: 465, secure: true });
  });

  it("convite: com SMTP entrega o link ao convidado; com SMTP fora do ar o convite vale e o link é mostrado", async () => {
    const { org, ctx } = await makeOrgWithOwner("mail");
    const role = await roleByKey(org.id, "LAWYER");
    useSmtp();
    const a = await createInvitation(ctx, { email: `conv-a-${Date.now()}@exemplo.test`, roleId: role.id });
    expect(a.emailDelivered).toBe(true);
    expect(received).toHaveLength(1);
    expect(qp(received[0]!.raw)).toContain(new URL(a.link).searchParams.get("token") ?? "sem-token");
    useSmtp(await freePort());
    const b = await createInvitation(ctx, { email: `conv-b-${Date.now()}@exemplo.test`, roleId: role.id });
    expect(b.emailDelivered).toBe(false);
    expect(b.link).toContain("token=");
  });
});
