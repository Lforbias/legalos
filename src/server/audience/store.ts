import "server-only";
import { db } from "@/lib/db/client";
import { randomUUID } from "node:crypto";
import { publicUrl } from "@/lib/audience/policy";
export async function sql<T = Record<string, unknown>>(
  query: string,
  ...values: unknown[]
): Promise<T[]> {
  return db.$queryRawUnsafe<T[]>(query, ...values);
}
export { db };
export const uid = () => randomUUID();
export type Settings = {
  reviewer: string;
  moderator: string;
  blog_enabled: boolean;
  community_enabled: boolean;
  legal_approved: boolean;
};
export async function settings(): Promise<Settings> {
  return (
    await sql<Settings>("SELECT * FROM audience_settings WHERE id=1")
  )[0]!;
}
export type Member = {
  id: string;
  name: string;
  email: string;
  origin: string;
  marketing: boolean;
  invited: boolean;
  area: string;
  state: string;
};
export type Post = {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary: string;
  practical: string;
  applies: string;
  source_url: string;
  source_name: string;
  source_date: Date;
  accessed_at: Date;
  tool: string;
  reviewed_by: string;
  reviewed_at: Date;
  published_at: Date;
  updated_at: Date;
  correction: string;
  status: string;
};
export async function posts(q = "", category = "", page = 1): Promise<Post[]> {
  return sql<Post>(
    `SELECT p.* FROM audience_posts p, audience_settings s WHERE s.id=1 AND s.blog_enabled AND s.legal_approved AND p.status='published' AND p.published_at<=now() AND ($1='' OR p.title ILIKE '%'||$1||'%' OR p.summary ILIKE '%'||$1||'%') AND ($2='' OR p.category=$2) ORDER BY p.published_at DESC LIMIT 12 OFFSET $3`,
    q.slice(0, 200),
    category,
    (Math.max(1, Math.min(1000, page || 1)) - 1) * 12,
  );
}
export async function post(slug: string): Promise<Post | undefined> {
  return (
    await sql<Post>(
      `SELECT p.* FROM audience_posts p,audience_settings s WHERE s.id=1 AND s.blog_enabled AND s.legal_approved AND p.status='published' AND p.published_at<=now() AND p.slug=$1`,
      slug,
    )
  )[0];
}
export type Question = {
  id: string;
  member_id: string;
  title: string;
  body: string;
  category: string;
  tribunal: string;
  name: string;
  state: string;
  created_at: Date;
  votes: number;
  replies: number;
};
export const questionSelect = `SELECT q.*,m.name,m.state,(SELECT count(*)::int FROM audience_marks WHERE target_id=q.id AND kind='question_vote') votes,(SELECT count(*)::int FROM audience_replies WHERE question_id=q.id AND status='approved') replies FROM audience_questions q JOIN audience_members m ON m.id=q.member_id`;
export async function questions(
  q = "",
  category = "",
  sort = "",
  page = 1,
): Promise<Question[]> {
  const s = await settings();
  if (!s.community_enabled || !s.legal_approved) return [];
  return sql<Question>(
    `${questionSelect} WHERE q.status='approved' AND ($1='' OR q.title ILIKE '%'||$1||'%' OR q.body ILIKE '%'||$1||'%' OR q.tribunal ILIKE '%'||$1||'%') AND ($2='' OR q.category=$2) ${sort === "unanswered" ? "AND NOT EXISTS(SELECT 1 FROM audience_replies WHERE question_id=q.id AND status='approved')" : ""} ORDER BY ${sort === "useful" ? "votes DESC," : ""} q.created_at DESC LIMIT 15 OFFSET $3`,
    q.slice(0, 200),
    category,
    (Math.max(1, Math.min(1000, page || 1)) - 1) * 15,
  );
}
export async function question(id: string): Promise<Question | undefined> {
  const s = await settings();
  if (!s.community_enabled || !s.legal_approved) return;
  return (
    await sql<Question>(
      `${questionSelect} WHERE q.id::text=$1 AND q.status='approved'`,
      id,
    )
  )[0];
}
export async function event(
  kind: string,
  origin: string,
  memberId: string | null = null,
) {
  await sql(
    "INSERT INTO audience_events(id,member_id,origin,kind) VALUES($1::uuid,$2::uuid,$3,$4)",
    uid(),
    memberId,
    origin,
    kind,
  );
}
export async function audit(admin: string, action: string, target: string) {
  await sql(
    "INSERT INTO audience_audit(id,admin_id,action,target) VALUES($1::uuid,$2::uuid,$3,$4)",
    uid(),
    admin,
    action,
    target,
  );
}
export async function demo(member: Member) {
  await db.$transaction(async (t) => {
    await t.$executeRaw`UPDATE audience_members SET converted_at=coalesce(converted_at,now()) WHERE id=${member.id}::uuid`;
    await t.$executeRaw`INSERT INTO audience_events(id,member_id,origin,kind) VALUES(${uid()}::uuid,${member.id}::uuid,${member.origin},'demo')`;
    await t.$executeRaw`UPDATE com_prospects SET tags=array_append(tags,${"origem:" + member.origin}) WHERE email=${member.email} AND deleted_at IS NULL AND NOT (${"origem:" + member.origin}=ANY(tags))`;
    // Qualified inbound requests only; account creation does not authorize sales contact.
    await t.$executeRaw`INSERT INTO com_prospects(id,name,email,tags,notes,stage) SELECT ${uid()}::uuid,${member.name},${member.email},ARRAY[${"origem:" + member.origin}],${"Solicitou demonstração pelo LegalOS " + member.origin},'QUALIFICADO' WHERE NOT EXISTS(SELECT 1 FROM com_prospects WHERE email=${member.email} AND deleted_at IS NULL)`;
  });
  return publicUrl("/produto/contato");
}

/** Aggregate acquisition metrics only; caller is the protected Commercial dashboard. */
export async function acquisitionSummary() {
  return sql<{
    origin: string;
    signups: number;
    optins: number;
    demos: number;
    won: number;
  }>(`SELECT origin,
 (SELECT count(*)::int FROM audience_members m WHERE m.origin=o.origin) signups,
 (SELECT count(*)::int FROM audience_members m WHERE m.origin=o.origin AND m.marketing) optins,
 (SELECT count(DISTINCT e.member_id)::int FROM audience_events e WHERE e.origin=o.origin AND e.kind='demo') demos,
 (SELECT count(*)::int FROM com_prospects p WHERE p.stage='GANHO' AND p.deleted_at IS NULL AND ('origem:'||o.origin)=ANY(p.tags)) won
 FROM (VALUES('blog'),('ferramenta'),('comunidade')) AS o(origin)`);
}
