import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import { z } from "zod";
import { db, sql, posts, type Member } from "./store";
import { withdraw } from "./auth";
import { publicUrl } from "@/lib/audience/policy";
export const onboarding = [
  {
    day: 0,
    subject: "Bem-vindo ao LegalOS",
    text: "Sua conta gratuita está pronta. Comece com uma ferramenta e confira a memória do resultado.",
    path: "/ferramentas",
  },
  {
    day: 2,
    subject: "Uma ferramenta para a sua rotina",
    text: "Confira as calculadoras públicas de prazos e verbas rescisórias. Os critérios e limites ficam junto ao resultado.",
    path: "/ferramentas",
  },
  {
    day: 5,
    subject: "Conheça o LegalOS em uso",
    text: "Conheça os recursos do LegalOS. Você também pode pedir uma demonstração com dados fictícios.",
    path: "/produto/recursos",
  },
  {
    day: 9,
    subject: "Quer ver o LegalOS de perto?",
    text: "Peça uma demonstração para conhecer os fluxos que podem ajudar seu escritório.",
    path: "/minha-conta",
  },
];
// Day 14 is deliberately omitted until a real trial/founder offer is configured.
function secret() {
  const s = process.env.AUDIENCE_UNSUBSCRIBE_SECRET;
  if (!s || s.length < 32)
    throw new Error(
      "Configure AUDIENCE_UNSUBSCRIBE_SECRET com ao menos 32 caracteres.",
    );
  return s;
}
function signature(id: string) {
  return createHmac("sha256", secret())
    .update("audience-unsubscribe:" + id)
    .digest("hex");
}
export async function unsubscribe(id: string, token: string) {
  z.uuid().parse(id);
  if (
    !/^[a-f0-9]{64}$/.test(token) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(signature(id)))
  )
    throw new Error(
      "Link de saída inválido. Use Minha conta para ajustar sua preferência.",
    );
  const m = (
    await sql<Member>("SELECT * FROM audience_members WHERE id=$1::uuid", id)
  )[0];
  if (m) await withdraw(m);
}
export async function marketingSweep() {
  if (process.env.AUDIENCE_MARKETING_ENABLED !== "1")
    return { enabled: false, sent: 0 };
  const host = process.env.MARKETING_SMTP_HOST,
    from = process.env.MARKETING_FROM;
  if (
    !host ||
    !from ||
    !process.env.MARKETING_SMTP_USER ||
    !process.env.MARKETING_SMTP_PASS
  )
    throw new Error("SMTP de marketing incompleto.");
  const domain = from.match(/@([^>\s]+)/)?.[1],
    appHost = new URL(publicUrl()).hostname;
  if (
    !domain ||
    domain === appHost ||
    domain === process.env.MAIL_FROM?.match(/@([^>\s]+)/)?.[1]
  )
    throw new Error(
      "Use um subdomínio próprio para marketing, separado dos e-mails do serviço.",
    );
  secret();
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.MARKETING_SMTP_PORT ?? 587),
    secure: process.env.MARKETING_SMTP_PORT === "465",
    requireTLS: true,
    auth: {
      user: process.env.MARKETING_SMTP_USER,
      pass: process.env.MARKETING_SMTP_PASS,
    },
    connectionTimeout: 10000,
    socketTimeout: 20000,
  });
  let sent = 0;
  try {
    const members = await sql<Member & { marketing_at: Date }>(
      `SELECT m.* FROM audience_members m WHERE marketing AND NOT blocked AND converted_at IS NULL AND marketing_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM com_prospects p WHERE p.email=m.email AND p.stage IN ('DEMONSTRACAO','GANHO') AND p.deleted_at IS NULL) ORDER BY marketing_at LIMIT 100`,
    );
    for (const m of members) {
      if (sent >= 20) break;
      const days = Math.floor(
        (Date.now() - m.marketing_at.getTime()) / 86400000,
      );
      // Only the most recent due step: never dump several delayed emails at once.
      const sequence = [...onboarding];
      const offer = process.env.AUDIENCE_TRIAL_OFFER_PATH;
      if (offer && /^\/produto\/[a-z0-9/-]+$/.test(offer))
        sequence.push({
          day: 14,
          subject: "Conheça a oferta disponível do LegalOS",
          text: "Confira as condições e a disponibilidade da oferta vigente do LegalOS.",
          path: offer,
        });
      let step:
        | { day: number; subject: string; text: string; path: string }
        | undefined = sequence.reverse().find((x) => x.day <= days);
      let stepKey = String(step?.day);
      if (days >= 21) {
        const recent = (await posts())
          .filter((p) => p.published_at.getTime() > Date.now() - 7 * 86400000)
          .slice(0, 5);
        if (!recent.length) continue;
        step = {
          day: days,
          subject: "Seu resumo semanal do LegalOS",
          text: recent
            .map(
              (p) =>
                p.title +
                "\n" +
                p.summary +
                "\n" +
                publicUrl("/blog/" + p.slug),
            )
            .join("\n\n"),
          path: "/blog",
        };
        stepKey = "weekly:" + Math.floor(days / 7);
      }
      if (!step) continue;
      const unsub = publicUrl(
        "/api/audience/unsubscribe?id=" + m.id + "&token=" + signature(m.id),
      );
      const webUnsub = publicUrl(
        "/sair-das-novidades?id=" + m.id + "&token=" + signature(m.id),
      );
      const delivered = await db.$transaction(async (t) => {
        // Serialize against unsubscribe, other cron runs, and explicit demo requests.
        const current = (
          await t.$queryRawUnsafe<
            { marketing: boolean; converted_at: Date | null }[]
          >(
            "SELECT marketing,converted_at FROM audience_members WHERE id=$1::uuid FOR UPDATE",
            m.id,
          )
        )[0];
        if (!current?.marketing || current.converted_at) return false;
        const already = await t.$queryRawUnsafe<{ one: number }[]>(
          `SELECT 1 FROM audience_mail_deliveries WHERE member_id=$1::uuid AND (step=$2 OR sent_at>now()-($3::int * interval '1 hour'))`,
          m.id,
          stepKey,
          days >= 21 ? 168 : 24,
        );
        if (already.length) return false;
        // Claim before SMTP. If the provider accepts and the process fails, no automatic retry/duplicate send.
        await t.$executeRawUnsafe(
          "INSERT INTO audience_mail_deliveries(member_id,step) VALUES($1::uuid,$2)",
          m.id,
          stepKey,
        );
        return true;
      });
      if (!delivered) continue;
      try {
        await transport.sendMail({
          from,
          to: m.email,
          subject: step.subject,
          text:
            step.text +
            "\n\n" +
            publicUrl(step.path) +
            "\n\nVocê escolheu receber novidades do LegalOS. Sair da lista: " +
            webUnsub,
          headers: {
            "List-Unsubscribe": `<${unsub}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        await sql(
          "UPDATE audience_mail_deliveries SET status='sent' WHERE member_id=$1::uuid AND step=$2",
          m.id,
          stepKey,
        );
        sent++;
      } catch {
        await sql(
          "UPDATE audience_mail_deliveries SET status='failed',error='Falha no SMTP; revisar manualmente antes de reenviar.' WHERE member_id=$1::uuid AND step=$2",
          m.id,
          stepKey,
        );
      }
    }
  } finally {
    transport.close();
  }
  return { enabled: true, sent };
}
