import type { Metadata } from "next";
import Link from "next/link";
import { sql, type Post } from "@/server/audience/store";
import { Hero, date, Empty } from "../../_parts";
export const metadata: Metadata = {
  title: "Correções e atualizações",
  alternates: { canonical: "/blog/correcoes" },
};
export default async function Corrections() {
  const rows = await sql<Post>(
    `SELECT p.* FROM audience_posts p,audience_settings s WHERE s.id=1 AND s.blog_enabled AND s.legal_approved AND p.status='published' AND p.published_at<=now() AND p.correction!='' ORDER BY p.updated_at DESC LIMIT 100`,
  );
  return (
    <>
      <Hero eyebrow="Transparência editorial" title="Correções e atualizações.">
        <p className="aud-lead">
          Encontrou algo que precisa ser corrigido? Fale com a equipe editorial
          pela página de contato.
        </p>
      </Hero>
      <div className="aud-wrap aud-content">
        {rows.map((p) => (
          <article className="aud-card" key={p.id}>
            <span className="aud-tag">{date(p.updated_at)}</span>
            <h2>
              <Link href={"/blog/" + p.slug}>{p.title}</Link>
            </h2>
            <p>{p.correction}</p>
          </article>
        ))}
        {!rows.length && (
          <Empty title="Nenhuma correção publicada">
            As notas aparecerão aqui quando um artigo publicado for corrigido e
            aprovado novamente.
          </Empty>
        )}
        <Link className="aud-btn" href="/produto/contato">
          Avisar a equipe editorial
        </Link>
      </div>
    </>
  );
}
