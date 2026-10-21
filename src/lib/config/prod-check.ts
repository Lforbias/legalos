import { asaasConfigFromEnv } from "../billing/asaas";
import { smtpConfigFromEnv } from "../mail/mailer";
export type CheckLevel = "error" | "warn";
export type CheckIssue = { level: CheckLevel; code: string; message: string };

/** Confere o ambiente para produção. Função pura (recebe o env), usada por `npm run check:prod` e testada. */
export function checkProductionEnv(env: Record<string, string | undefined>): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const err = (code: string, message: string) => issues.push({ level: "error", code, message });
  const warn = (code: string, message: string) => issues.push({ level: "warn", code, message });

  const db = env.DATABASE_URL?.trim();
  if (!db) err("DATABASE_URL", "DATABASE_URL não definida.");
  else {
    if (/legalos_dev|localhost|127\.0\.0\.1/.test(db)) warn("DATABASE_LOCAL", "DATABASE_URL parece apontar para o banco de desenvolvimento (localhost/senha de exemplo).");
    if (!/sslmode=(require|verify)/.test(db) && !/@(localhost|127\.0\.0\.1|db|postgres)[:/]/.test(db)) warn("DATABASE_SSL", "Banco remoto sem sslmode=require na DATABASE_URL: o tráfego até o banco pode ir sem criptografia.");
  }

  const app = env.APP_URL?.trim();
  if (!app) err("APP_URL", "APP_URL não definida (usada nos links de convite e recuperação de senha).");
  else if (!/^https:\/\//.test(app)) err("APP_URL_HTTPS", "APP_URL deve começar com https:// em produção (cookie de sessão é 'secure').");

  if (env.NODE_ENV !== "production") warn("NODE_ENV", "NODE_ENV não é 'production' (use npm run build + npm run start).");

  const mfa = env.MFA_ENCRYPTION_KEY?.trim();
  if (!mfa) err("MFA_KEY", "MFA_ENCRYPTION_KEY ausente: ninguém conseguirá ativar a verificação em duas etapas.");
  else if (Buffer.from(mfa, "base64").length !== 32) err("MFA_KEY_LEN", "MFA_ENCRYPTION_KEY deve ser 32 bytes em base64 (openssl rand -base64 32).");

  const ck = env.CERT_ENCRYPTION_KEY?.trim();
  if (!ck) warn("CERT_KEY", "CERT_ENCRYPTION_KEY ausente: o cofre de certificados digitais fica indisponível (necessário para o motor de tribunais).");
  else if (Buffer.from(ck, "base64").length !== 32) err("CERT_KEY_LEN", "CERT_ENCRYPTION_KEY deve ser 32 bytes em base64 (openssl rand -base64 32).");
  if (ck && mfa && ck === mfa) err("CERT_KEY_REUSE", "CERT_ENCRYPTION_KEY não pode ser igual a MFA_ENCRYPTION_KEY.");

  const mailDriver = env.MAIL_DRIVER ?? "console";
  if (mailDriver === "console") warn("MAIL_CONSOLE", "MAIL_DRIVER=console: convites, confirmação de e-mail e recuperação de senha NÃO são entregues (o administrador precisa repassar os links manualmente). Configure MAIL_DRIVER=smtp (veja .env.example).");
  else if (mailDriver === "smtp") {
    const m = smtpConfigFromEnv(env);
    if (m.error) err("MAIL_SMTP", `MAIL_DRIVER=smtp, mas a configuração está incompleta: ${m.error}`);
    else if (m.config?.allowPlain) err("MAIL_SMTP_PLAIN", "SMTP_ALLOW_PLAIN=1 envia credenciais e links sem criptografia; é só para testes.");
  } else err("MAIL_DRIVER", "MAIL_DRIVER deve ser console ou smtp.");

  const anyAsaas = env.ASAAS_API_KEY || env.ASAAS_WEBHOOK_TOKEN;
  if (!anyAsaas) warn("ASAAS_OFF", "Cobrança automática desligada (ASAAS_API_KEY/ASAAS_WEBHOOK_TOKEN ausentes): planos continuam sendo definidos à mão pela administração.");
  else {
    const a = asaasConfigFromEnv(env);
    if (a.error) err("ASAAS", `Cobrança automática incompleta: ${a.error}`);
    else if (a.config?.sandbox) warn("ASAAS_SANDBOX", "ASAAS_ENV=sandbox: cobranças de TESTE. Troque para production só depois de validar o fluxo completo na sandbox do Asaas.");
    if (env.ASAAS_API_URL && !/^https:\/\//.test(env.ASAAS_API_URL)) err("ASAAS_URL", "ASAAS_API_URL deve ser https:// (use só para apontar a um simulador em testes).");
  }
  if (env.WHATSAPP_QR_FAKE) err("WHATSAPP_QR_FAKE", "WHATSAPP_QR_FAKE é só para testes: ele simula a conexão por QR-Code e NÃO fala com o WhatsApp. Remova do ambiente de produção.");
  const anyWa = env.WHATSAPP_APP_SECRET || env.WHATSAPP_VERIFY_TOKEN;
  if (!anyWa) warn("WHATSAPP_OFF", "Atendimento por WhatsApp desligado (WHATSAPP_APP_SECRET/WHATSAPP_VERIFY_TOKEN ausentes): nenhuma mensagem é recebida.");
  else {
    if (!env.WHATSAPP_APP_SECRET?.trim()) err("WHATSAPP_SECRET", "WHATSAPP_APP_SECRET ausente (segredo do aplicativo na Meta; assina os webhooks).");
    if ((env.WHATSAPP_VERIFY_TOKEN?.trim().length ?? 0) < 16) err("WHATSAPP_VERIFY", "WHATSAPP_VERIFY_TOKEN ausente ou curto (mínimo 16 caracteres; gere com `openssl rand -hex 16`).");
    if (!ck) err("WHATSAPP_KEY", "O WhatsApp precisa de CERT_ENCRYPTION_KEY para guardar o token com segurança.");
    if (env.WHATSAPP_API_URL && !/^https:\/\//.test(env.WHATSAPP_API_URL)) err("WHATSAPP_URL", "WHATSAPP_API_URL deve ser https:// (use só para apontar a um simulador em testes).");
  }
  if (mailDriver === "smtp" && !env.CRON_SECRET) warn("MAIL_QUEUE_CRON", "Sem CRON_SECRET o agendador da fila de e-mails (avisos de cobrança, reenvio) não roda.");

  if (!env.STORAGE_DIR?.trim()) warn("STORAGE_DIR", "STORAGE_DIR não definido: os documentos vão para ./.storage dentro do app e somem se o contêiner for recriado. Use um volume persistente com backup.");

  if (env.RATE_LIMIT_MULTIPLIER && Number(env.RATE_LIMIT_MULTIPLIER) > 1) err("RATE_LIMIT", "RATE_LIMIT_MULTIPLIER > 1 enfraquece o limite de tentativas de login; é só para testes E2E.");
  if (env.PRISMA_SCHEMA_ENGINE_BINARY === "/bin/true" || env.PRISMA_QUERY_ENGINE_LIBRARY === "/bin/true") err("PRISMA_FAKE", "Variáveis PRISMA_*_ENGINE apontando para /bin/true são só do sandbox de testes; remova.");

  if ((env.PETITIONING_ADAPTER ?? "demo") === "demo") warn("PETITION_DEMO", "Peticionamento em modo demonstração: nenhuma petição é protocolada em tribunal.");
  if (env.PETITIONING_ADAPTER === "mni") warn("PETITION_MNI", "Protocolo REAL pelo MNI ligado: ainda não validado em tribunal real (tipos de documento, assinatura digital e recibo variam por tribunal). Valide em homologação antes de usar com processos de clientes.");
  const regMode = env.REGISTRATION_MODE?.trim().toLowerCase();
  if (!regMode || regMode === "open") warn("REGISTRATION_OPEN", "Cadastro ABERTO: qualquer visitante pode criar conta e escritório. Defina REGISTRATION_MODE=closed (só por convite) ou code (com REGISTRATION_CODE) em produção.");
  if (regMode === "code" && (env.REGISTRATION_CODE?.trim().length ?? 0) < 12) err("REGISTRATION_CODE", "REGISTRATION_MODE=code exige REGISTRATION_CODE com pelo menos 12 caracteres (sem isso o cadastro fica fechado).");
  if (env.ANTHROPIC_API_KEY && !env.AI_MONTHLY_TOKEN_LIMIT) warn("AI_LIMIT", "IA ligada sem AI_MONTHLY_TOKEN_LIMIT: vale o padrão de 500.000 tokens/mês por escritório.");
  if (!env.BACKUP_DIR?.trim()) warn("BACKUP_DIR", "BACKUP_DIR não definido: configure e agende scripts/backup.sh (veja docs/backup-restore.md).");
  return issues;
}
