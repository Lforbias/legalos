"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatform } from "@/server/platform";
import { sql, db, uid, settings, audit } from "@/server/audience/store";
import { captureSource, draftFromSnapshot } from "@/server/audience/editorial";
import { officialUrl, categories, dateSchema } from "@/lib/audience/policy";
import { postSchema } from "@/lib/audience/policy";
export async function manage(form: FormData) {
  const { user } = await requirePlatform();
  const action = String(form.get("action") ?? "");
  let error = "";
  try {
    if (action === "source") {
      const input = z
        .object({
          name: z.string().trim().min(2).max(150),
          url: z.string().refine(officialUrl),
          category: z.enum(categories),
        })
        .parse(Object.fromEntries(form));
      await sql(
        "INSERT INTO audience_sources(id,name,url,category) VALUES($1::uuid,$2,$3,$4) ON CONFLICT(url) DO UPDATE SET active=true,name=excluded.name,category=excluded.category",
        uid(),
        input.name,
        input.url,
        input.category,
      );
    } else if (action === "capture") {
      await captureSource(z.uuid().parse(form.get("id")));
    } else if (action === "generate") {
      await draftFromSnapshot(
        z.uuid().parse(form.get("id")),
        dateSchema.parse(form.get("source_date")),
      );
    } else if (action === "settings") {
      const reviewer = z.string().trim().max(150).parse(form.get("reviewer")),
        moderator = z.string().trim().max(150).parse(form.get("moderator"));
      const legal = form.get("legal") === "on",
        blog = form.get("blog") === "on",
        community = form.get("community") === "on";
      if (
        (blog && (!reviewer || !legal)) ||
        (community && (!moderator || !legal))
      )
        throw new Error(
          "Defina os responsáveis e confirme a revisão jurídica antes de abrir.",
        );
      await sql(
        "UPDATE audience_settings SET reviewer=$1,moderator=$2,legal_approved=$3,blog_enabled=$4,community_enabled=$5 WHERE id=1",
        reviewer,
        moderator,
        legal,
        blog,
        community,
      );
    } else if (action === "draft") {
      const input = postSchema.parse(Object.fromEntries(form)),
        id = String(form.get("id") || uid());
      z.uuid().parse(id);
      const existing = (
        await sql<{ status: string }>(
          "SELECT status FROM audience_posts WHERE id=$1::uuid",
          id,
        )
      )[0];
      const correction = z
        .string()
        .trim()
        .max(3000)
        .parse(form.get("correction") ?? "");
      if (existing?.status === "published" && !correction)
        throw new Error(
          "Descreva a alteração para manter o histórico de correções visível.",
        );
      await sql(
        `INSERT INTO audience_posts(id,slug,title,category,summary,practical,applies,source_url,source_name,source_date,accessed_at,tool,correction) VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11::date,$12,$13) ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,title=excluded.title,category=excluded.category,summary=excluded.summary,practical=excluded.practical,applies=excluded.applies,source_url=excluded.source_url,source_name=excluded.source_name,source_date=excluded.source_date,accessed_at=excluded.accessed_at,tool=excluded.tool,correction=excluded.correction,status='draft',reviewed_at=NULL,reviewed_by=NULL,updated_at=now()`,
        id,
        ...Object.values(input),
        correction,
      );
    } else if (action === "publish") {
      const s = await settings();
      if (!s.legal_approved || !s.reviewer || !s.blog_enabled)
        throw new Error("Defina revisão e habilite o blog.");
      if (form.get("review") !== "on")
        throw new Error("Confirme a revisão da fonte, vigência e prazos.");
      const id = z.uuid().parse(form.get("id"));
      await db.$transaction(async (t) => {
        await t.$executeRawUnsafe("SELECT pg_advisory_xact_lock(6272626)");
        const rows = await t.$queryRawUnsafe<Record<string, unknown>[]>(
          "SELECT * FROM audience_posts WHERE id=$1::uuid FOR UPDATE",
          id,
        );
        const p = rows[0];
        if (!p || p.status !== "draft")
          throw new Error("Selecione um rascunho.");
        postSchema.parse({
          ...p,
          source_date: (p.source_date as Date).toISOString().slice(0, 10),
          accessed_at: (p.accessed_at as Date).toISOString().slice(0, 10),
        });
        if (
          (p.source_date as Date) > new Date() ||
          (p.accessed_at as Date) > new Date()
        )
          throw new Error("Datas de fonte e acesso não podem estar no futuro.");
        const recent = await t.$queryRawUnsafe<{ n: number }[]>(
          `SELECT count(*)::int n FROM audience_posts WHERE published_at >= date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' AND id!=$1::uuid`,
          id,
        );
        if ((recent[0]?.n ?? 0) >= 1 && form.get("urgent") !== "on")
          throw new Error(
            "Já houve uma publicação hoje. Marque urgência apenas quando justificado.",
          );
        await t.$executeRawUnsafe(
          `UPDATE audience_posts SET status='published',reviewed_by=$1,reviewed_at=now(),published_at=coalesce(published_at,now()),updated_at=now() WHERE id=$2::uuid`,
          s.reviewer,
          id,
        );
      });
    } else if (action === "archive") {
      await sql(
        "UPDATE audience_posts SET status='archived',updated_at=now() WHERE id=$1::uuid",
        z.uuid().parse(form.get("id")),
      );
    } else if (action === "invite") {
      const email = z
        .email()
        .transform((s) => s.toLowerCase())
        .parse(form.get("email"));
      await sql(
        "INSERT INTO audience_invites(email) VALUES($1) ON CONFLICT DO NOTHING",
        email,
      );
      await sql(
        "UPDATE audience_members SET invited=true WHERE email=$1",
        email,
      );
    } else if (action === "moderate") {
      const table = z
          .enum(["audience_questions", "audience_replies", "audience_comments"])
          .parse(form.get("table")),
        id = z.uuid().parse(form.get("id")),
        status = z.enum(["approved", "hidden"]).parse(form.get("status"));
      await db.$transaction(async (t) => {
        const old = (
          await t.$queryRawUnsafe<{ status: string; question_id?: string }[]>(
            `SELECT * FROM ${table} WHERE id=$1::uuid FOR UPDATE`,
            id,
          )
        )[0];
        if (!old) throw new Error("Conteúdo não encontrado.");
        if (table === "audience_replies" && status === "approved") {
          const q = (
            await t.$queryRawUnsafe<{ id: string; member_id: string }[]>(
              `SELECT id,member_id FROM audience_questions WHERE id=$1::uuid AND status='approved' FOR SHARE`,
              old.question_id,
            )
          )[0];
          if (!q) throw new Error("Aprove a pergunta antes da resposta.");
          if (old.status !== "approved")
            await t.$executeRawUnsafe(
              "INSERT INTO audience_notifications(id,member_id,question_id,message) VALUES($1::uuid,$2::uuid,$3::uuid,$4)",
              uid(),
              q.member_id,
              q.id,
              "Uma nova resposta foi aprovada na sua pergunta.",
            );
        }
        await t.$executeRawUnsafe(
          `UPDATE ${table} SET status=$1 ${table === "audience_replies" && status === "hidden" ? ",accepted=false" : ""} WHERE id=$2::uuid`,
          status,
          id,
        );
      });
    } else if (action === "resolve") {
      await sql(
        "UPDATE audience_reports SET resolved_at=now() WHERE id=$1::uuid",
        z.uuid().parse(form.get("id")),
      );
    } else if (action === "block") {
      const id = z.uuid().parse(form.get("id"));
      await sql(
        "UPDATE audience_members SET blocked=true,marketing=false WHERE id=$1::uuid",
        id,
      );
      await sql("DELETE FROM audience_sessions WHERE member_id=$1::uuid", id);
    } else throw new Error("Ação inválida.");
    await audit(
      user.id,
      action,
      String(form.get("id") ?? form.get("email") ?? "settings"),
    );
  } catch (e) {
    error =
      e instanceof z.ZodError
        ? (e.issues[0]?.message ?? "Confira os campos.")
        : e instanceof Error && !("code" in e)
          ? e.message
          : "Não foi possível salvar. Confira se o endereço do post já existe.";
  }
  revalidatePath("/blog");
  revalidatePath("/comunidade");
  revalidatePath("/admin/conteudo");
  redirect(
    "/admin/conteudo?" + (error ? "erro=" + encodeURIComponent(error) : "ok=1"),
  );
}
