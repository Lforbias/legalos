import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "@/lib/logging/logger";

export type MailMessage = { to: string; subject: string; text: string; html?: string };

export interface Mailer {
  readonly name: string;
  /** Indica se o driver entrega e-mails de verdade. */
  readonly delivers: boolean;
  send(message: MailMessage): Promise<void>;
}

/**
 * Driver de desenvolvimento: registra a mensagem no log do servidor. NÃO entrega e-mail.
 * A UI informa isso ao usuário (links são exibidos para cópia manual).
 * Em produção o corpo (que contém links com token) NUNCA é registrado em log.
 */
class ConsoleMailer implements Mailer {
  readonly name = "console";
  readonly delivers = false;
  async send(message: MailMessage) {
    const includeBody = process.env.NODE_ENV !== "production";
    logger.info("mail.not_delivered_console_driver", { to: message.to, subject: message.subject, ...(includeBody ? { body: message.text } : {}) });
  }
}

export type SmtpConfig = { host: string; port: number; secure: boolean; user?: string; pass?: string; from: string; allowPlain: boolean };

/** Lê a configuração SMTP do ambiente. Devolve `error` em português quando está incompleta. */
export function smtpConfigFromEnv(env: Record<string, string | undefined> = process.env): { config?: SmtpConfig; error?: string } {
  const host = env.SMTP_HOST?.trim();
  const from = env.MAIL_FROM?.trim();
  if (!host) return { error: "SMTP_HOST não definido." };
  if (!from || !/^[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+$|^.+<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>$/.test(from)) return { error: "MAIL_FROM ausente ou inválido (ex.: LegalOS <nao-responda@seudominio.com.br>)." };
  const secure = env.SMTP_SECURE === "true" || env.SMTP_SECURE === "1";
  const port = Number(env.SMTP_PORT ?? (secure ? 465 : 587));
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: "SMTP_PORT inválida." };
  if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASS)) return { error: "Defina SMTP_USER e SMTP_PASS juntos (ou nenhum dos dois)." };
  return { config: { host, port, secure, user: env.SMTP_USER || undefined, pass: env.SMTP_PASS || undefined, from, allowPlain: env.SMTP_ALLOW_PLAIN === "1" } };
}

class SmtpMailer implements Mailer {
  readonly name = "smtp";
  readonly delivers = true;
  private transport: Transporter;
  constructor(private readonly cfg: SmtpConfig) {
    this.transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      // Sem TLS as credenciais e os links de acesso trafegariam em claro: exige STARTTLS salvo opt-in explícito (só testes).
      requireTLS: !cfg.secure && !cfg.allowPlain,
      ignoreTLS: cfg.allowPlain,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  async send(message: MailMessage) {
    // Evita injeção de cabeçalhos: destinatário e assunto não podem ter quebra de linha.
    if (/[\r\n]/.test(message.to) || /[\r\n]/.test(message.subject)) throw new Error("Cabeçalho de e-mail inválido.");
    await this.transport.sendMail({ from: this.cfg.from, to: message.to, subject: message.subject, text: message.text, ...(message.html ? { html: message.html } : {}) });
  }
}

let cached: { key: string; mailer: Mailer } | null = null;

export function getMailer(): Mailer {
  if ((process.env.MAIL_DRIVER ?? "console") !== "smtp") return new ConsoleMailer();
  const { config, error } = smtpConfigFromEnv();
  if (!config) {
    logger.error("mail.smtp_misconfigured", { reason: error });
    return new ConsoleMailer(); // nunca finge entrega: delivers=false e a UI mostra o link
  }
  const key = JSON.stringify(config);
  if (!cached || cached.key !== key) cached = { key, mailer: new SmtpMailer(config) };
  return cached.mailer;
}

/**
 * Envia sem nunca lançar: devolve se foi entregue ao servidor SMTP. Falha de e-mail não pode derrubar cadastro,
 * recuperação de senha nem convite (o convite continua válido e o link é mostrado ao administrador).
 * O corpo da mensagem nunca vai para o log (contém tokens).
 */
export async function sendMailSafe(message: MailMessage): Promise<{ delivered: boolean }> {
  const mailer = getMailer();
  try {
    await mailer.send(message);
    return { delivered: mailer.delivers };
  } catch (err) {
    logger.error("mail.send_failed", { driver: mailer.name, to: message.to, subject: message.subject, error: err instanceof Error ? err.message : String(err) });
    return { delivered: false };
  }
}

/** Teste de conexão SMTP (handshake + autenticação) SEM enviar nenhuma mensagem. */
export async function verifySmtpConnection(): Promise<{ ok: boolean; message: string }> {
  if ((process.env.MAIL_DRIVER ?? "console") !== "smtp") return { ok: false, message: "MAIL_DRIVER não está em smtp (e-mail de verdade desligado)." };
  const { config, error } = smtpConfigFromEnv();
  if (!config) return { ok: false, message: error ?? "Configuração SMTP incompleta." };
  const t = nodemailer.createTransport({
    host: config.host, port: config.port, secure: config.secure,
    requireTLS: !config.secure && !config.allowPlain, ignoreTLS: config.allowPlain,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
  });
  try {
    await t.verify();
    return { ok: true, message: "Servidor SMTP respondeu e aceitou a autenticação (nenhuma mensagem enviada)." };
  } catch (e) {
    return { ok: false, message: `SMTP recusou ou não respondeu: ${(e instanceof Error ? e.message : "erro").replace(/\s+/g, " ").slice(0, 160)}` };
  } finally {
    t.close();
  }
}
