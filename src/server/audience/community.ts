import { z } from "zod";
import {
  questionSchema,
  replySchema,
  safePublicText,
} from "@/lib/audience/policy";
import { sql, uid, db, type Member } from "./store";
export async function createQuestion(member: Member, input: unknown) {
  const i = questionSchema.parse(input);
  safePublicText(i.title + " " + i.body + " " + i.tribunal);
  const id = uid();
  await sql(
    `INSERT INTO audience_questions(id,member_id,title,body,category,tribunal) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6)`,
    id,
    member.id,
    i.title,
    i.body,
    i.category,
    i.tribunal,
  );
  return {
    message:
      "Pergunta enviada para moderação. Você poderá acompanhá-la em Minha conta.",
  };
}
export async function createReply(member: Member, input: unknown) {
  const i = replySchema.parse(input);
  safePublicText(i.body + " " + i.source_url);
  await db.$transaction(async (t) => {
    const q = await t.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM audience_questions WHERE id=$1::uuid AND status='approved' FOR SHARE`,
      i.id,
    );
    if (!q.length) throw new Error("Pergunta não disponível.");
    await t.$executeRawUnsafe(
      `INSERT INTO audience_replies(id,question_id,member_id,body,source_url) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5)`,
      uid(),
      i.id,
      member.id,
      i.body,
      i.source_url,
    );
  });
  return {
    message:
      "Resposta enviada para revisão. A pessoa que perguntou será avisada após a aprovação.",
  };
}
export async function mark(member: Member, input: unknown) {
  const i = z
    .object({
      id: z.uuid(),
      kind: z.enum(["question_vote", "reply_vote", "save"]),
    })
    .parse(input);
  const table =
    i.kind === "reply_vote" ? "audience_replies" : "audience_questions";
  return db.$transaction(async (t) => {
    const target = (
      await t.$queryRawUnsafe<{ member_id: string }[]>(
        `SELECT member_id FROM ${table} WHERE id=$1::uuid AND status='approved' FOR SHARE`,
        i.id,
      )
    )[0];
    if (!target) throw new Error("Conteúdo não disponível.");
    if (i.kind !== "save" && target.member_id === member.id)
      throw new Error("Você não pode votar na própria publicação.");
    await t.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      member.id + i.id + i.kind,
    );
    const gone = await t.$executeRawUnsafe(
      "DELETE FROM audience_marks WHERE member_id=$1::uuid AND target_id=$2::uuid AND kind=$3",
      member.id,
      i.id,
      i.kind,
    );
    if (!gone)
      await t.$executeRawUnsafe(
        "INSERT INTO audience_marks(member_id,target_id,kind) VALUES($1::uuid,$2::uuid,$3)",
        member.id,
        i.id,
        i.kind,
      );
    return {
      message: gone
        ? "Marcação removida."
        : i.kind === "save"
          ? "Pergunta salva."
          : "Voto registrado.",
    };
  });
}
export async function accept(member: Member, input: unknown) {
  const { id } = z.object({ id: z.uuid() }).parse(input);
  await db.$transaction(async (t) => {
    const r = (
      await t.$queryRawUnsafe<{ question_id: string }[]>(
        `SELECT r.question_id FROM audience_replies r JOIN audience_questions q ON q.id=r.question_id WHERE r.id=$1::uuid AND q.member_id=$2::uuid AND q.status='approved' AND r.status='approved' FOR UPDATE OF q`,
        id,
        member.id,
      )
    )[0];
    if (!r)
      throw new Error(
        "Somente quem perguntou pode escolher uma resposta aprovada.",
      );
    await t.$executeRawUnsafe(
      "UPDATE audience_replies SET accepted=false WHERE question_id=$1::uuid",
      r.question_id,
    );
    await t.$executeRawUnsafe(
      "UPDATE audience_replies SET accepted=true WHERE id=$1::uuid",
      id,
    );
  });
  return { message: "Melhor resposta escolhida." };
}
