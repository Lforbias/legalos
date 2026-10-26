import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { post, posts, sql } from "@/server/audience/store";
import { viewer } from "@/server/audience/auth";
import { publicUrl } from "@/lib/audience/policy";
import { date, PostCard } from "../../_parts";
import { Compose, Report, Action } from "../../_forms";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await post((await params).slug);
  return p
    ? {
        title: p.title,
        description: p.summary,
        alternates: { canonical: "/blog/" + p.slug },
        openGraph: {
          type: "article",
          title: p.title,
          description: p.summary,
          publishedTime: p.published_at.toISOString(),
          modifiedTime: p.updated_at.toISOString(),
          authors: ["Equipe editorial LegalOS"],
        },
      }
    : { title: "Post não encontrado", robots: { index: false } };
}
export default async function BlogPost({ params }: Props) {
  const p = await post((await params).slug);
  if (!p) notFound();
  const m = await viewer(),
    related = (await posts("", p.category))
      .filter((x) => x.id !== p.id)
      .slice(0, 3),
    comments = await sql<{ id: string; body: string; name: string }>(
      `SELECT c.id,c.body,m.name FROM audience_comments c JOIN audience_members m ON m.id=c.member_id WHERE post_id=$1::uuid AND c.status='approved' ORDER BY c.created_at LIMIT 50`,
      p.id,
    );
  const json = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: p.title,
    description: p.summary,
    datePublished: p.published_at.toISOString(),
    dateModified: p.updated_at.toISOString(),
    author: { "@type": "Organization", name: "Equipe editorial LegalOS" },
    mainEntityOfPage: publicUrl("/blog/" + p.slug),
  };
  return (
    <div className="aud-wrap aud-content">
      <script
        nonce={(await headers()).get("x-nonce") ?? undefined}
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(json).replace(/</g, "\\u003c"),
        }}
      />
      <p className="aud-breadcrumb">
        <Link href="/blog">Blog</Link> / {p.category} / {p.title}
      </p>
      <div className="aud-grid">
        <article>
          <span className="aud-tag">{p.category}</span>
          <h1>{p.title}</h1>
          <div className="aud-meta">
            <span>Equipe editorial LegalOS</span>
            <span>Publicado em {date(p.published_at)}</span>
            <span>
              Revisado por {p.reviewed_by} em {date(p.reviewed_at)}
            </span>
            <span>Atualizado em {date(p.updated_at)}</span>
          </div>
          <div className="aud-card aud-summary">
            <h3>Resumo em 3 linhas</h3>
            <p>{p.summary}</p>
          </div>
          <h2 id="pratica">O que muda na prática</h2>
          <div className="aud-prose">{p.practical}</div>
          <h2 id="vigencia">Para quem e desde quando</h2>
          <div className="aud-prose">{p.applies}</div>
          <div
            className="aud-card aud-source"
            id="fonte"
            style={{ marginTop: 28 }}
          >
            <h3>Fonte oficial</h3>
            <a
              className="aud-link"
              href={p.source_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {p.source_name} ↗
            </a>
            <p className="aud-muted">
              Acessado em {date(p.accessed_at)}. Texto publicado em{" "}
              {date(p.source_date)}.
            </p>
          </div>
          {p.correction && (
            <div className="aud-card warning">
              <h3>Correção · {date(p.updated_at)}</h3>
              <p>{p.correction}</p>
            </div>
          )}
          <p className="aud-muted">
            Este resumo não substitui a análise do advogado nem o texto oficial.
            Encontrou um erro?{" "}
            <Link className="aud-link" href="/produto/contato">
              Avise a equipe editorial.
            </Link>
          </p>
          <div className="aud-card blue">
            <h3>Dúvidas sobre este post?</h3>
            <p>Pergunte a outros advogados na LegalOS Comunidade.</p>
            <Link className="aud-btn primary" href="/comunidade/nova">
              Perguntar na comunidade
            </Link>
          </div>
          <h2>Comentários</h2>
          {comments.map((c) => (
            <div className="aud-card" key={c.id}>
              <p className="aud-prose">{c.body}</p>
              <span className="aud-muted">{c.name}</span>
              <Report id={c.id} />
            </div>
          ))}
          <div className="aud-card">
            {m ? (
              <Compose kind="comment" id={p.slug} />
            ) : (
              <p className="aud-muted">
                Entre na conta gratuita para comentar.{" "}
                <Link className="aud-link" href="/acesso?origem=blog">
                  Entrar
                </Link>
              </p>
            )}
          </div>
        </article>
        <aside>
          <div className="aud-card">
            <h3>Neste post</h3>
            <a className="aud-listlink" href="#pratica">
              O que muda na prática
            </a>
            <a className="aud-listlink" href="#vigencia">
              Para quem e desde quando
            </a>
            <a className="aud-listlink" href="#fonte">
              Fonte oficial
            </a>
          </div>
          <div className="aud-card dark">
            <div className="aud-eyebrow">Ferramenta relacionada</div>
            <h3>
              {p.tool === "prazos"
                ? "Contagem auxiliar de prazos"
                : "Estimativa de verbas rescisórias"}
            </h3>
            <p>Resultado na tela, sem cadastro.</p>
            <Link className="aud-btn primary" href={"/ferramentas/" + p.tool}>
              Abrir calculadora
            </Link>
          </div>
          <div className="aud-card">
            <h3>Veja o sistema em uso</h3>
            <p className="aud-muted">
              Prazos, intimações e atendimento ligados no mesmo processo.
            </p>
            {m ? (
              <Action path="demo">Pedir demonstração →</Action>
            ) : (
              <Link className="aud-link" href="/produto/contato">
                Pedir demonstração →
              </Link>
            )}
          </div>
        </aside>
      </div>
      {related.length > 0 && (
        <>
          <h2>Leia também</h2>
          <div className="aud-columns">
            {related.map((p) => (
              <PostCard key={p.id} p={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
