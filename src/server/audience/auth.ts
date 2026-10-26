import "server-only";
import { cookies } from "next/headers";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { getMailer, sendMailSafe } from "@/lib/mail/mailer";
import {
  TERMS_VERSION,
  TERMS_TEXT,
  MARKETING_TEXT,
  publicUrl,
} from "@/lib/audience/policy";
import { sql, db, uid, type Member, settings } from "./store";
const COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Host-legalos_audience"
    : "legalos_audience";
const browserCookie =
  process.env.NODE_ENV === "production"
    ? "__Host-legalos_audience_auth"
    : "legalos_audience_auth";
const opts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
type Attempt = {
  token_hash: string;
  browser_hash: string;
  email: string | null;
  name: string;
  origin: string;
  marketing: boolean;
  verifier: string | null;
};
export async function viewer(): Promise<Member | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  return (
    (
      await sql<Member>(
        `SELECT m.* FROM audience_sessions s JOIN audience_members m ON m.id=s.member_id WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT m.blocked`,
        hashToken(token),
      )
    )[0] ?? null
  );
}
export async function requireViewer(pilot = false): Promise<Member> {
  const m = await viewer();
  if (!m) throw new Error("Entre na sua conta gratuita para continuar.");
  if (pilot) {
    const s = await settings();
    if (!s.community_enabled || !s.legal_approved || !m.invited)
      throw new Error(
        "A comunidade está em piloto fechado. É necessário um convite.",
      );
  }
  return m;
}
export async function logout() {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (token)
    await sql(
      "DELETE FROM audience_sessions WHERE token_hash=$1",
      hashToken(token),
    );
  c.delete(COOKIE);
}
export async function begin(
  input: { email?: string; name?: string; origin: string; marketing: boolean },
  google = false,
) {
  if (!(await settings()).legal_approved)
    throw new Error(
      "O cadastro abrirá após a revisão dos termos e da política de privacidade.",
    );
  const token = generateToken(),
    browser = generateToken(),
    verifier = google ? generateToken() : null;
  await sql("DELETE FROM audience_auth WHERE expires_at<now()");
  await sql(
    `INSERT INTO audience_auth(token_hash,browser_hash,email,name,origin,marketing,verifier,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '15 minutes')`,
    hashToken(token),
    hashToken(browser),
    input.email ?? null,
    input.name ?? "",
    input.origin,
    input.marketing,
    verifier,
  );
  (await cookies()).set(browserCookie, browser, { ...opts, maxAge: 900 });
  if (google) {
    if (
      !process.env.AUDIENCE_GOOGLE_CLIENT_ID ||
      !process.env.AUDIENCE_GOOGLE_CLIENT_SECRET
    )
      throw new Error("Login Google ainda não configurado. Use seu e-mail.");
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.search = new URLSearchParams({
      client_id: process.env.AUDIENCE_GOOGLE_CLIENT_ID,
      redirect_uri: publicUrl("/api/audience/google/callback"),
      response_type: "code",
      scope: "openid email profile",
      state: token,
      code_challenge: Buffer.from(hashToken(verifier!), "hex").toString(
        "base64url",
      ),
      code_challenge_method: "S256",
    }).toString();
    return { url: u.toString() };
  }
  if (!getMailer().delivers)
    throw new Error(
      "O envio de links de acesso ainda não está configurado. Tente novamente mais tarde.",
    );
  const link = publicUrl(
    "/acesso/confirmar?token=" + encodeURIComponent(token),
  );
  const delivered = await sendMailSafe({
    to: input.email!,
    subject: "Seu link de acesso ao LegalOS",
    text: `Abra o link no mesmo navegador em que solicitou o acesso. Ele expira em 15 minutos e só funciona uma vez.\n\n${link}\n\nSe não foi você, ignore este e-mail.`,
  });
  if (!delivered.delivered)
    throw new Error(
      "Não foi possível enviar o link agora. Tente novamente mais tarde.",
    );
  return {
    message:
      "Enviamos um link de acesso. Abra no mesmo navegador em até 15 minutos.",
  };
}
async function attempt(token: string) {
  const browser = (await cookies()).get(browserCookie)?.value;
  if (!browser)
    throw new Error("Abra o link no navegador em que iniciou o acesso.");
  const a = (
    await sql<Attempt>(
      "SELECT * FROM audience_auth WHERE token_hash=$1 AND browser_hash=$2 AND expires_at>now()",
      hashToken(token),
      hashToken(browser),
    )
  )[0];
  if (!a)
    throw new Error("O link expirou ou já foi utilizado. Solicite outro.");
  return a;
}
async function finish(
  a: Attempt,
  identity: { email: string; name: string; sub?: string },
) {
  const token = generateToken();
  await db.$transaction(async (t) => {
    const consumed = await t.$queryRawUnsafe<Attempt[]>(
      "DELETE FROM audience_auth WHERE token_hash=$1 AND expires_at>now() RETURNING *",
      a.token_hash,
    );
    if (!consumed.length) throw new Error("Este acesso já foi utilizado.");
    const existing = await t.$queryRawUnsafe<
      (Member & { google_sub: string | null; blocked: boolean })[]
    >(
      "SELECT * FROM audience_members WHERE email=$1 FOR UPDATE",
      identity.email,
    );
    const old = existing[0];
    if (old?.blocked)
      throw new Error("Esta conta foi bloqueada pela moderação.");
    if (old?.google_sub && identity.sub && old.google_sub !== identity.sub)
      throw new Error("Identidade Google diferente da conta cadastrada.");
    const id = old?.id ?? uid();
    await t.$executeRawUnsafe(
      `INSERT INTO audience_members(id,email,name,google_sub,origin,unsubscribe_hash,invited) VALUES($1::uuid,$2,$3,$4,$5,$6,EXISTS(SELECT 1 FROM audience_invites WHERE email=$2)) ON CONFLICT(email) DO UPDATE SET google_sub=coalesce(audience_members.google_sub,excluded.google_sub),invited=audience_members.invited OR excluded.invited`,
      id,
      identity.email,
      identity.name,
      identity.sub ?? null,
      a.origin,
      hashToken(generateToken()),
    );
    await t.$executeRawUnsafe(
      `INSERT INTO audience_consents(id,member_id,kind,version,text,origin) VALUES($1::uuid,$2::uuid,'terms',$3,$4,$5)`,
      uid(),
      id,
      TERMS_VERSION,
      TERMS_TEXT,
      a.origin,
    );
    if (a.marketing && !old?.marketing) {
      await t.$executeRawUnsafe(
        `UPDATE audience_members SET marketing=true,marketing_at=now() WHERE id=$1::uuid`,
        id,
      );
      await t.$executeRawUnsafe(
        `INSERT INTO audience_consents(id,member_id,kind,version,text,origin) VALUES($1::uuid,$2::uuid,'marketing',$3,$4,$5)`,
        uid(),
        id,
        TERMS_VERSION,
        MARKETING_TEXT,
        a.origin,
      );
    }
    await t.$executeRawUnsafe(
      `INSERT INTO audience_sessions(token_hash,member_id,expires_at) VALUES($1,$2::uuid,now()+interval '30 days')`,
      hashToken(token),
      id,
    );
    if (!old)
      await t.$executeRawUnsafe(
        `INSERT INTO audience_events(id,member_id,origin,kind) VALUES($1::uuid,$2::uuid,$3,'signup')`,
        uid(),
        id,
        a.origin,
      );
  });
  (await cookies()).set(COOKIE, token, { ...opts, maxAge: 30 * 86400 });
  (await cookies()).delete(browserCookie);
  return a.origin === "ferramenta"
    ? "/ferramentas"
    : a.origin === "comunidade"
      ? "/comunidade"
      : "/blog";
}
export async function emailFinish(token: string) {
  const a = await attempt(token);
  if (!a.email || a.verifier) throw new Error("Link inválido.");
  return finish(a, { email: a.email, name: a.name });
}
export async function googleFinish(state: string, code: string) {
  const a = await attempt(state);
  if (!a.verifier) throw new Error("Estado inválido.");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.AUDIENCE_GOOGLE_CLIENT_ID!,
      client_secret: process.env.AUDIENCE_GOOGLE_CLIENT_SECRET!,
      redirect_uri: publicUrl("/api/audience/google/callback"),
      grant_type: "authorization_code",
      code_verifier: a.verifier,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok)
    throw new Error("O Google recusou a autenticação. Tente novamente.");
  const tokens = await r.json();
  const user = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!user.ok)
    throw new Error("Não foi possível confirmar a identidade Google.");
  const data = await user.json();
  if (
    data.email_verified !== true ||
    typeof data.sub !== "string" ||
    typeof data.email !== "string"
  )
    throw new Error("Confirme seu e-mail no Google antes de continuar.");
  return finish(a, {
    email: data.email.toLowerCase(),
    name: String(data.name ?? data.email).slice(0, 100),
    sub: data.sub,
  });
}
export async function withdraw(member: Member) {
  await db.$transaction(async (t) => {
    await t.$executeRaw`UPDATE audience_members SET marketing=false WHERE id=${member.id}::uuid`;
    await t.$executeRaw`INSERT INTO audience_consents(id,member_id,kind,version,text,origin) VALUES(${uid()}::uuid,${member.id}::uuid,'withdrawal',${TERMS_VERSION},'Solicitou descadastro de marketing',${member.origin})`;
  });
}
