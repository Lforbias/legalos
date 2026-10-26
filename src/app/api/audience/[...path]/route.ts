import { unsubscribe } from "@/server/audience/marketing";
import { NextResponse } from "next/server";
import { z } from "zod";
import { RateLimiter } from "@/lib/security/rate-limit";
import {
  signupSchema,
  originSchema,
  safePublicText,
  publicUrl,
} from "@/lib/audience/policy";
import {
  begin,
  emailFinish,
  googleFinish,
  requireViewer,
  logout,
  withdraw,
} from "@/server/audience/auth";
import { sql, uid, event, demo, post } from "@/server/audience/store";
import { calculatePublic } from "@/server/audience/tools";
import { resultPdf } from "@/server/audience/pdf";
import type { CalcResult } from "@/lib/calc/num";
import { viewer } from "@/server/audience/auth";
import {
  createQuestion,
  createReply,
  mark,
  accept,
} from "@/server/audience/community";
const writes = new RateLimiter(25, 3600000),
  auth = new RateLimiter(8, 900000),
  tools = new RateLimiter(60, 60000);
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
export async function GET(req: Request, ctx: Context) {
  const path = (await ctx.params).path.join("/"),
    u = new URL(req.url);
  if (/^calculations\/[0-9a-f-]{36}\/pdf$/.test(path)) {
    const m = await viewer();
    if (!m)
      return NextResponse.json(
        { error: "Entre na sua conta." },
        { status: 401 },
      );
    const r = (
      await sql<{ result: CalcResult }>(
        "SELECT result FROM audience_calculations WHERE id=$1::uuid AND member_id=$2::uuid",
        path.split("/")[1],
        m.id,
      )
    )[0];
    if (!r)
      return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
    return new Response(new Uint8Array(await resultPdf(r.result)), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": "attachment; filename=legalos-calculo.pdf",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }
  if (path === "unsubscribe")
    return new Response(
      '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Sair das novidades</title><p>Para confirmar o descadastro, use o link Sair da lista no corpo da mensagem ou suas preferências em Minha conta.</p></html>',
      {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        },
      },
    );
  if (path !== "google/callback")
    return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  try {
    const target = await googleFinish(
      u.searchParams.get("state") ?? "",
      u.searchParams.get("code") ?? "",
    );
    return NextResponse.redirect(publicUrl(target));
  } catch {
    return NextResponse.redirect(publicUrl("/acesso?erro=google"));
  }
}
export async function POST(req: Request, ctx: Context) {
  const path = (await ctx.params).path.join("/");
  if (path === "unsubscribe") {
    try {
      const url = new URL(req.url);
      const form = await req.formData();
      await unsubscribe(
        String(form.get("id") ?? url.searchParams.get("id") ?? ""),
        String(form.get("token") ?? url.searchParams.get("token") ?? ""),
      );
      return new Response("Você saiu da lista de novidades do LegalOS.", {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    } catch {
      return new Response(
        "Link inválido. Ajuste as preferências em Minha conta.",
        { status: 400 },
      );
    }
  }
  // Browsers may omit Origin for same-origin fetches. Fetch Metadata is browser-controlled.
  const expectedOrigin = new URL(publicUrl()).origin;
  const givenOrigin = req.headers.get("origin");
  const sameOrigin = givenOrigin
    ? givenOrigin === expectedOrigin
    : req.headers.get("sec-fetch-site") === "same-origin" &&
      new URL(req.url).origin === expectedOrigin;
  if (!sameOrigin)
    return NextResponse.json(
      { error: "Origem não permitida." },
      { status: 403 },
    );
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const limiter = path.startsWith("auth/")
    ? auth
    : path === "calculate"
      ? tools
      : writes;
  if (!limiter.check(ip))
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde antes de continuar." },
      { status: 429 },
    );
  try {
    if (Number(req.headers.get("content-length") ?? 0) > 24000)
      return NextResponse.json(
        { error: "Conteúdo muito grande." },
        { status: 413 },
      );
    const raw = await req.text();
    if (raw.length > 24000)
      return NextResponse.json(
        { error: "Conteúdo muito grande." },
        { status: 413 },
      );
    const i = JSON.parse(raw || "{}");
    if (path === "auth/email" || path === "auth/google") {
      const data =
        path === "auth/email"
          ? signupSchema.parse(i)
          : z
              .object({
                origin: originSchema,
                marketing: z.boolean(),
                terms: z.literal(true),
              })
              .parse(i);
      return NextResponse.json(await begin(data, path === "auth/google"));
    }
    if (path === "auth/confirm")
      return NextResponse.json({
        url: await emailFinish(
          z.object({ token: z.string().min(32).max(100) }).parse(i).token,
        ),
      });
    if (path === "logout") {
      await logout();
      return NextResponse.json({ url: "/acesso" });
    }
    if (path === "calculate") {
      const r = calculatePublic(i);
      await event("tool_use", "ferramenta");
      return NextResponse.json(r);
    }
    const member = await requireViewer(
      ["question", "reply", "mark", "accept", "report"].includes(path),
    );
    if (path === "question")
      return NextResponse.json(await createQuestion(member, i));
    if (path === "reply")
      return NextResponse.json(await createReply(member, i));
    if (path === "mark") return NextResponse.json(await mark(member, i));
    if (path === "accept") return NextResponse.json(await accept(member, i));
    if (path === "withdraw") {
      await withdraw(member);
      return NextResponse.json({
        message:
          "Você saiu da lista de novidades. Sua conta continua disponível.",
      });
    }
    if (path === "profile") {
      const p = z
        .object({
          name: z.string().trim().min(2).max(100),
          area: z.string().max(80),
          state: z.string().regex(/^[A-Z]{2}$/),
        })
        .parse(i);
      await sql(
        "UPDATE audience_members SET name=$1,area=$2,state=$3 WHERE id=$4::uuid",
        p.name,
        p.area,
        p.state,
        member.id,
      );
      return NextResponse.json({ message: "Perfil atualizado." });
    }
    if (path === "demo") return NextResponse.json({ url: await demo(member) });
    if (path === "save") {
      const r = calculatePublic(i),
        id = uid();
      await sql(
        "INSERT INTO audience_calculations(id,member_id,tool,input,result) VALUES($1::uuid,$2::uuid,$3,$4::jsonb,$5::jsonb)",
        id,
        member.id,
        r.input.tool,
        JSON.stringify(r.input),
        JSON.stringify(r.result),
      );
      await event("tool_save", "ferramenta", member.id);
      return NextResponse.json({
        message: "Cálculo salvo. O PDF está disponível em Minha conta.",
        url: "/minha-conta",
      });
    }
    if (path === "report") {
      const r = z
        .object({ id: z.uuid(), reason: z.string().trim().min(10).max(1000) })
        .parse(i);
      await sql(
        `INSERT INTO audience_reports(id,member_id,target_id,reason) VALUES($1::uuid,$2::uuid,$3::uuid,$4)`,
        uid(),
        member.id,
        r.id,
        r.reason,
      );
      return NextResponse.json({
        message: "Denúncia recebida. A moderação fará a análise.",
      });
    }
    if (path === "comment") {
      const c = z
        .object({
          post: z.string().max(140).optional(),
          tool: z.enum(["prazos", "rescisao"]).optional(),
          body: z.string().trim().min(10).max(3000),
        })
        .refine((c) => Boolean(c.post) !== Boolean(c.tool))
        .parse(i);
      safePublicText(c.body);
      const p = c.post ? await post(c.post) : null;
      if (c.post && !p) throw new Error("Post não disponível.");
      await sql(
        "INSERT INTO audience_comments(id,member_id,post_id,tool,body) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5)",
        uid(),
        member.id,
        p?.id ?? null,
        c.tool ?? null,
        c.body,
      );
      return NextResponse.json({
        message: "Comentário enviado para moderação.",
      });
    }
    return NextResponse.json({ error: "Não encontrado." }, { status: 404 });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Confira os campos informados."
            : e instanceof Error && !("code" in e)
              ? e.message
              : "Não foi possível concluir agora.",
      },
      { status: 400 },
    );
  }
}
