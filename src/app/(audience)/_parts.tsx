import Link from "next/link";
import { categories } from "@/lib/audience/policy";
import type { Post } from "@/server/audience/store";
export const date = (d: Date | string) =>
  new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });
export function Hero({
  eyebrow,
  title,
  children,
  side,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
  side?: React.ReactNode;
}) {
  return (
    <section className="aud-hero">
      <div className={"aud-wrap " + (side ? "aud-hero-grid" : "")}>
        <div>
          <div className="aud-eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          {children}
        </div>
        {side}
      </div>
    </section>
  );
}
export function Filters({
  base,
  category,
  q = "",
  sort = "",
}: {
  base: string;
  category: string;
  q?: string;
  sort?: string;
}) {
  return (
    <nav className="aud-chips" aria-label="Áreas">
      {["", ...categories].map((c) => (
        <Link
          aria-current={c === category ? "page" : undefined}
          className={"aud-chip " + (c === category ? "active" : "")}
          key={c}
          href={base + "?" + new URLSearchParams({ area: c, q, ordem: sort })}
        >
          {c || "Todas"}
        </Link>
      ))}
    </nav>
  );
}
export function ToolsCard() {
  return (
    <section className="aud-card">
      <h3>LegalOS Tools</h3>
      <p className="aud-muted">
        Resultado na tela, sem cadastro. Salve o cálculo e baixe o PDF com sua
        conta gratuita.
      </p>
      <Link className="aud-listlink" href="/ferramentas/prazos">
        Contagem auxiliar de prazos →
      </Link>
      <Link className="aud-listlink" href="/ferramentas/rescisao">
        Estimativa de verbas rescisórias →
      </Link>
      <Link className="aud-link" href="/ferramentas">
        Ver todas as ferramentas →
      </Link>
    </section>
  );
}
export function RulesCard() {
  return (
    <section className="aud-card warning">
      <h3>Antes de postar</h3>
      <p>
        Não publique dados de clientes. CPF, CNPJ e número de processo são
        bloqueados automaticamente.
      </p>
      <p>Não ofereça serviços nem peça indicação de clientes.</p>
      <p>Respostas entre colegas não são parecer jurídico.</p>
      <Link href="/comunidade/regras">
        <u>Ler as regras completas</u>
      </Link>
    </section>
  );
}
export function PostCard({
  p,
  featured = false,
}: {
  p: Post;
  featured?: boolean;
}) {
  return (
    <article className={"aud-card " + (featured ? "dark" : "")}>
      <span className="aud-tag">{p.category}</span>
      <h2 style={{ marginTop: 0, fontSize: featured ? 30 : 21 }}>
        <Link href={"/blog/" + p.slug}>{p.title}</Link>
      </h2>
      <p className={featured ? "aud-lead" : "aud-muted"}>{p.summary}</p>
      <div className="aud-row">
        <span className="aud-muted">
          Fonte: {p.source_name} · {date(p.published_at)}
        </span>
        {featured && (
          <Link className="aud-btn primary" href={"/blog/" + p.slug}>
            Ler resumo
          </Link>
        )}
      </div>
    </article>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="aud-card aud-empty">
      <h3>{title}</h3>
      <p className="aud-muted">{children}</p>
    </div>
  );
}
