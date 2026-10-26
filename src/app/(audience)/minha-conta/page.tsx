import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { viewer } from "@/server/audience/auth";
import { sql } from "@/server/audience/store";
import { Action, Profile } from "../_forms";
import { date } from "../_parts";
export const metadata: Metadata = {
  title: "Minha conta gratuita",
  robots: { index: false, follow: false },
};
export default async function Account() {
  const m = await viewer();
  if (!m) redirect("/acesso");
  const [calcs, questions, notices, saved] = await Promise.all([
    sql<{ id: string; tool: string; created_at: Date }>(
      "SELECT id,tool,created_at FROM audience_calculations WHERE member_id=$1::uuid ORDER BY created_at DESC LIMIT 50",
      m.id,
    ),
    sql<{ id: string; title: string; status: string }>(
      "SELECT id,title,status FROM audience_questions WHERE member_id=$1::uuid ORDER BY created_at DESC LIMIT 50",
      m.id,
    ),
    sql<{ id: string; question_id: string; message: string }>(
      `SELECT n.* FROM audience_notifications n JOIN audience_questions q ON q.id=n.question_id WHERE n.member_id=$1::uuid AND q.status='approved' ORDER BY n.created_at DESC LIMIT 30`,
      m.id,
    ),
    sql<{ id: string; title: string }>(
      `SELECT q.id,q.title FROM audience_marks k JOIN audience_questions q ON q.id=k.target_id WHERE k.member_id=$1::uuid AND k.kind='save' AND q.status='approved'`,
      m.id,
    ),
  ]);
  return (
    <div className="aud-wrap aud-content">
      <div className="aud-row">
        <div>
          <span className="aud-tag">
            Conta gratuita{m.invited ? " · Participante do piloto" : ""}
          </span>
          <h1>Olá, {m.name.split(" ")[0]}.</h1>
        </div>
        <Action path="logout">Sair</Action>
      </div>
      <div className="aud-grid">
        <section>
          <div className="aud-card">
            <h2 style={{ marginTop: 0 }}>Seus cálculos salvos</h2>
            {!calcs.length && (
              <p className="aud-muted">
                Seus resultados aparecerão aqui após salvar uma calculadora.
              </p>
            )}
            {calcs.map((c) => (
              <div className="aud-row aud-listlink" key={c.id}>
                <span>
                  {c.tool === "prazos"
                    ? "Contagem de prazo"
                    : "Verbas rescisórias"}{" "}
                  · {date(c.created_at)}
                </span>
                <a
                  className="aud-link"
                  href={"/api/audience/calculations/" + c.id + "/pdf"}
                >
                  Baixar PDF →
                </a>
              </div>
            ))}
            <Link className="aud-btn" href="/ferramentas">
              Usar uma ferramenta
            </Link>
          </div>
          <div className="aud-card">
            <h2 style={{ marginTop: 0 }}>Notificações</h2>
            {notices.length ? (
              notices.map((n) => (
                <Link
                  className="aud-listlink"
                  href={"/comunidade/" + n.question_id}
                  key={n.id}
                >
                  {n.message}
                </Link>
              ))
            ) : (
              <p className="aud-muted">Nenhuma novidade por aqui.</p>
            )}
          </div>
          <div className="aud-card">
            <h2 style={{ marginTop: 0 }}>Minhas perguntas</h2>
            {questions.map((q) => (
              <p key={q.id}>
                {q.status === "approved" ? (
                  <Link className="aud-link" href={"/comunidade/" + q.id}>
                    {q.title}
                  </Link>
                ) : (
                  q.title
                )}{" "}
                <span className="aud-tag">
                  {q.status === "pending"
                    ? "Em moderação"
                    : q.status === "hidden"
                      ? "Removida"
                      : "Publicada"}
                </span>
              </p>
            ))}
            {!questions.length && (
              <p className="aud-muted">Você ainda não enviou perguntas.</p>
            )}
            <h3>Perguntas salvas</h3>
            {saved.map((q) => (
              <Link
                className="aud-listlink"
                href={"/comunidade/" + q.id}
                key={q.id}
              >
                {q.title}
              </Link>
            ))}
          </div>
        </section>
        <aside>
          <div className="aud-card">
            <h3>Seu perfil</h3>
            <Profile name={m.name} area={m.area} state={m.state} />
          </div>
          <div className="aud-card">
            <h3>Preferências de e-mail</h3>
            <p className="aud-muted">
              {m.marketing
                ? "Você aceitou receber novidades. Pode sair quando quiser."
                : "Você recebe apenas e-mails necessários ao serviço."}
            </p>
            {m.marketing && (
              <Action path="withdraw">Sair da lista de novidades</Action>
            )}
          </div>
          <div className="aud-card dark">
            <h3>Conheça o LegalOS</h3>
            <p>Veja os recursos para a rotina do seu escritório.</p>
            <Action path="demo" primary>
              Pedir demonstração
            </Action>
          </div>
        </aside>
      </div>
    </div>
  );
}
