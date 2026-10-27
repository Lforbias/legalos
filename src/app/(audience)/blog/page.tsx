import type { Metadata } from "next";
import Link from "next/link";
import { posts } from "@/server/audience/store";
import { Hero, Filters, ToolsCard, PostCard, Empty, PlatformCard } from "../_parts";
export const metadata: Metadata = {
  title: "Blog — direito na prática, com fonte e data",
  alternates: {
    canonical: "/blog",
    types: { "application/rss+xml": "/blog/rss.xml" },
  },
};
export default async function Blog({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; area?: string; pagina?: string }>;
}) {
  const s = await searchParams,
    page = Math.max(1, Number(s.pagina) || 1),
    list = await posts(s.q, s.area, page);
  return (
    <>
      <Hero
        eyebrow="LegalOS Blog"
        title="O que muda na rotina do advogado, com fonte e data."
        side={
          <div className="aud-card dark">
            <h3>Como produzimos cada post</h3>
            <p>✓ Fonte oficial com link e data de acesso</p>
            <p>✓ Rascunho automático, revisão humana antes de publicar</p>
            <p>✓ Data de atualização e página de correções</p>
            <Link href="/blog/como-produzimos" className="aud-editorial-link">
              Como produzimos →
            </Link>
          </div>
        }
      >
        <p className="aud-lead">
          Leis, súmulas e decisões resumidas na prática. Cada post passa por
          revisão humana antes de ir ao ar.
        </p>
        <form className="aud-search" role="search">
          <input
            className="aud-input"
            name="q"
            defaultValue={s.q}
            placeholder="Buscar lei, súmula ou tema"
            aria-label="Buscar no blog"
          />
          <button className="aud-btn primary">Buscar</button>
        </form>
      </Hero>
      <div className="aud-wrap aud-content">
        <Filters base="/blog" q={s.q} category={s.area ?? ""} />
        <div className="aud-grid">
          <section aria-label="Publicações">
            {list.length ? (
              <>
                <PostCard p={list[0]!} featured />
                <div className="aud-columns">
                  {list.slice(1).map((p) => (
                    <PostCard key={p.id} p={p} />
                  ))}
                </div>
              </>
            ) : (
              <Empty
                title={
                  s.q || s.area
                    ? "Nenhum post encontrado"
                    : "O próximo passo é uma boa leitura."
                }
              >
                {s.q || s.area
                  ? "Tente outro tema ou selecione todas as áreas."
                  : "Estamos preparando os primeiros resumos. Só publicamos após revisão jurídica e conferência da fonte oficial."}
              </Empty>
            )}
            <div className="aud-actions">
              {page > 1 && (
                <Link
                  className="aud-btn"
                  href={
                    "/blog?" +
                    new URLSearchParams({
                      q: s.q ?? "",
                      area: s.area ?? "",
                      pagina: String(page - 1),
                    })
                  }
                >
                  Mais recentes
                </Link>
              )}
              {list.length === 12 && (
                <Link
                  className="aud-btn"
                  href={
                    "/blog?" +
                    new URLSearchParams({
                      q: s.q ?? "",
                      area: s.area ?? "",
                      pagina: String(page + 1),
                    })
                  }
                >
                  Ver posts anteriores
                </Link>
              )}
            </div>
          </section>
          <aside>
            <ToolsCard />
            <PlatformCard />
            <div className="aud-card blue">
              <h3>Ficou com dúvida?</h3>
              <p>Conheça a proposta da comunidade e as condições de acesso ao piloto.</p>
              <Link className="aud-btn primary" href="/comunidade">
                Ir para a comunidade
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
