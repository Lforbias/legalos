import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { question, sql } from "@/server/audience/store";
import { viewer } from "@/server/audience/auth";
import { RulesCard, date } from "../../_parts";
import { Action, Compose, Report } from "../../_forms";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const q = await question((await params).id);
  return {
    title: q?.title ?? "Pergunta não encontrada",
    robots: { index: Boolean(q && q.replies > 0), follow: true },
    alternates: { canonical: "/comunidade/" + (await params).id },
  };
}
export default async function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const q = await question((await params).id);
  if (!q) notFound();
  const m = await viewer(),
    answers = await sql<{
      id: string;
      body: string;
      source_url: string;
      name: string;
      state: string;
      accepted: boolean;
      created_at: Date;
      votes: number;
    }>(
      `SELECT r.*,m.name,m.state,(SELECT count(*)::int FROM audience_marks WHERE target_id=r.id AND kind='reply_vote') votes FROM audience_replies r JOIN audience_members m ON m.id=r.member_id WHERE r.question_id=$1::uuid AND r.status='approved' ORDER BY r.accepted DESC,r.created_at LIMIT 100`,
      q.id,
    );
  return (
    <div className="aud-wrap aud-content">
      <p className="aud-breadcrumb">
        <Link href="/comunidade">Comunidade</Link> / {q.category} / Pergunta
      </p>
      <div className="aud-grid">
        <section>
          <article className="aud-card">
            <span className="aud-tag">{q.category}</span>
            {q.tribunal && (
              <span className="aud-tag" style={{ marginLeft: 8 }}>
                {q.tribunal}
              </span>
            )}
            <h1 style={{ fontSize: 34 }}>{q.title}</h1>
            <div className="aud-prose">{q.body}</div>
            <hr className="aud-rule" />
            <p className="aud-muted">
              {q.name} · {q.state} · {date(q.created_at)}
            </p>
            <div className="aud-actions">
              <Action path="mark" data={{ id: q.id, kind: "question_vote" }}>
                Pergunta útil · {q.votes}
              </Action>
              <Action path="mark" data={{ id: q.id, kind: "save" }}>
                Salvar
              </Action>
              <Report id={q.id} />
            </div>
          </article>
          <h2>{q.replies} respostas</h2>
          {answers.map((a) => (
            <article
              className={"aud-card " + (a.accepted ? "accepted" : "")}
              key={a.id}
            >
              {a.accepted && (
                <p className="aud-link">
                  ✓ Melhor resposta, escolhida por quem perguntou
                </p>
              )}
              <div className="aud-prose">{a.body}</div>
              {a.source_url && (
                <p>
                  <a
                    href={a.source_url}
                    className="aud-link"
                    rel="ugc nofollow noopener noreferrer"
                    target="_blank"
                  >
                    Fonte citada ↗
                  </a>
                </p>
              )}
              <hr className="aud-rule" />
              <p className="aud-muted">
                {a.name} · {a.state} · {date(a.created_at)}
              </p>
              <div className="aud-actions">
                <Action path="mark" data={{ id: a.id, kind: "reply_vote" }}>
                  Resposta útil · {a.votes}
                </Action>
                <Report id={a.id} />
                {m?.id === q.member_id && !a.accepted && (
                  <Action path="accept" data={{ id: a.id }}>
                    Escolher melhor resposta
                  </Action>
                )}
              </div>
            </article>
          ))}
          <div className="aud-card">
            <h2 style={{ marginTop: 0 }}>Sua resposta</h2>
            {m?.invited ? (
              <Compose kind="reply" id={q.id} />
            ) : (
              <p>
                Respostas estão disponíveis aos convidados do piloto.{" "}
                <Link className="aud-link" href="/acesso?origem=comunidade">
                  Entrar na conta gratuita
                </Link>
              </p>
            )}
          </div>
        </section>
        <aside>
          <div className="aud-card dark">
            <div className="aud-eyebrow">Ferramenta</div>
            <h3>Contagem auxiliar de prazos</h3>
            <Link className="aud-btn primary" href="/ferramentas/prazos">
              Abrir calculadora
            </Link>
          </div>
          <RulesCard />
        </aside>
      </div>
    </div>
  );
}
