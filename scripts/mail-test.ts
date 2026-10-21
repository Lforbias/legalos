import "./load-env";
import { getMailer, smtpConfigFromEnv } from "../src/lib/mail/mailer";

/**
 * Envia um e-mail de teste com a configuração atual (.env). Uso: npm run mail-test -- destino@exemplo.com
 * Mostra o erro real do servidor SMTP (autenticação, TLS, remetente recusado) em vez de esconder.
 */
async function main() {
  const to = process.argv[2];
  if (!to) throw new Error("Informe o destinatário: npm run mail-test -- destino@exemplo.com");
  if ((process.env.MAIL_DRIVER ?? "console") !== "smtp") throw new Error("MAIL_DRIVER não é smtp: nada será entregue. Defina MAIL_DRIVER=smtp e as variáveis SMTP_*.");
  const cfg = smtpConfigFromEnv();
  if (cfg.error) throw new Error(cfg.error);
  const mailer = getMailer();
  await mailer.send({ to, subject: "Teste de e-mail — LegalOS", text: "Se você recebeu esta mensagem, o envio de e-mail do LegalOS está funcionando." });
  console.log(`Enviado para ${to} via ${cfg.config!.host}:${cfg.config!.port}. Confira a caixa de entrada (e o spam).`);
}
main().catch((e) => { console.error("FALHOU:", e instanceof Error ? e.message : e); process.exit(1); });
