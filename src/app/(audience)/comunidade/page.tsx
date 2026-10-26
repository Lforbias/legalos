import type { Metadata } from "next";
import Link from "next/link";
import { questions, posts } from "@/server/audience/store";
import { Hero, Filters, RulesCard, Empty } from "../_parts";
export const metadata: Metadata = {
  title: "Comunidade — perguntas entre advogados",
  robots: { index: false, follow: true },
  alternates: { canonical: "/comunidade" },
};
export default async function Community({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    area?: string;
    ordem?: string;
    pagina?: string;
  }>;
}) {
  const s = await searchParams,
    page = Math.max(1, Number(s.pagina) || 1),
    rows = await questions(s.q, s.area, s.ordem, page),
    blog = await posts();
  return (
    <>
      <Hero
        eyebrow="LegalOS Comunidade · Piloto fechado, acesso por convite"
        title="Perguntas de colega para colega."
      >
        <p className="aud-lead">
          Dúvidas da rotina, respostas de quem já passou por isso e links para
          fontes oficiais e decisões do blog.
        </p>
      </Hero>
      <div className="aud-wrap aud-content">
        <div className="aud-grid">
          <section>
            <div className="aud-row">
              <form
                className="aud-search"
                style={{ marginTop: 0, flex: 1 }}
                role="search"
              >
                <input
                  className="aud-input"
                  name="q"
                  defaultValue={s.q}
                  placeholder="Buscar pergunta, tema ou tribunal"
                  aria-label="Buscar na comunidade"
                />
                <button className="aud-btn">Buscar</button>
              </form>
              <Link className="aud-btn primary" href="/comunidade/nova">
                Fazer pergunta
              </Link>
            </div>
            <div style={{ marginTop: 20 }}>
              <Filters
                base="/comunidade"
                q={s.q}
                sort={s.ordem}
                category={s.area ?? ""}
              />
            </div>
            <nav className="aud-tabs" aria-label="Ordenar perguntas">
              {[
                ["", "Recentes"],
                ["unanswered", "Sem resposta"],
                ["useful", "Mais úteis"],
              ].map(([v, l]) => (
                <Link
                  aria-current={(s.ordem ?? "") === v ? "page" : undefined}
                  key={v}
                  href={
                    "/comunidade?" +
                    new URLSearchParams({
                      q: s.q ?? "",
                      area: s.area ?? "",
                      ordem: v ?? "",
                    })
                  }
                >
                  {l}
                </Link>
              ))}
            </nav>
            {rows.map((q) => (
              <article className="aud-card aud-question" key={q.id}>
                <div className="aud-score">
                  <b>{q.votes}</b>
                  <small>úteis</small>
                </div>
                <div>
                  <h3>
                    <Link href={"/comunidade/" + q.id}>{q.title}</Link>
                  </h3>
                  <span className="aud-tag">{q.category}</span>
                  <span className="aud-muted">
                    {q.name}
                    {q.state ? " · " + q.state : ""} ·{" "}
                    {q.replies ? q.replies + " respostas" : "Sem resposta"}
                  </span>
                </div>
              </article>
            ))}
            {!rows.length && (
              <Empty title="Uma boa comunidade começa com uma dúvida real.">
                O piloto será aberto a convidados após a definição da moderação.
                Perguntas aprovadas aparecerão aqui; não criamos perfis nem
                discussões fictícias.
              </Empty>
            )}
            <div className="aud-actions">
              {page > 1 && (
                <Link
                  className="aud-btn"
                  href={
                    "/comunidade?" +
                    new URLSearchParams({ ...s, pagina: String(page - 1) })
                  }
                >
                  Anteriores
                </Link>
              )}
              {rows.length === 15 && (
                <Link
                  className="aud-btn"
                  href={
                    "/comunidade?" +
                    new URLSearchParams({ ...s, pagina: String(page + 1) })
                  }
                >
                  Ver mais perguntas
                </Link>
              )}
            </div>
          </section>
          <aside>
            <RulesCard />
            <div className="aud-card">
              <h3>Do blog</h3>
              {blog.slice(0, 3).map((p) => (
                <Link
                  className="aud-listlink"
                  href={"/blog/" + p.slug}
                  key={p.id}
                >
                  {p.title}
                </Link>
              ))}
              {!blog.length && (
                <p className="aud-muted">
                  Os primeiros resumos estão em preparação.
                </p>
              )}
            </div>
            <div className="aud-card dark">
              <h3>Moderação</h3>
              <p className="aud-muted">
                Viu algo que viola as regras? Use Denunciar em qualquer pergunta
                ou resposta. No piloto, a meta de análise é de 24 horas úteis.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
