import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "@/server/audience/store";
import { Compose, Report } from "../../_forms";
import { viewer } from "@/server/audience/auth";
import { Hero, RulesCard } from "../../_parts";
import Calculator from "./calculator";
const names: Record<string, string> = {
  prazos: "Contagem auxiliar de prazos",
  rescisao: "Estimativa de verbas rescisórias",
};
export async function generateMetadata({
  params,
}: {
  params: Promise<{ tool: string }>;
}): Promise<Metadata> {
  const t = (await params).tool;
  return {
    title: names[t] ?? "Ferramenta",
    alternates: { canonical: "/ferramentas/" + t },
  };
}
export default async function Tool({
  params,
}: {
  params: Promise<{ tool: string }>;
}) {
  const { tool } = await params;
  if (tool !== "prazos" && tool !== "rescisao") notFound();
  const m = await viewer();
  const comments = await sql<{ id: string; body: string; name: string }>(
    `SELECT c.id,c.body,m.name FROM audience_comments c JOIN audience_members m ON m.id=c.member_id WHERE c.tool=$1 AND c.status='approved' ORDER BY c.created_at LIMIT 50`,
    tool,
  );
  return (
    <>
      <Hero eyebrow="LegalOS Tools · Sem cadastro" title={names[tool]!}>
        <p className="aud-lead">
          Resultado na tela, critérios transparentes e memória de cálculo para
          conferência.
        </p>
      </Hero>
      <div className="aud-wrap aud-content">
        <div className="aud-grid">
          <div>
            <Calculator tool={tool} logged={Boolean(m)} />
            <h2>Dúvidas sobre a ferramenta</h2>
            {comments.map((c) => (
              <div className="aud-card" key={c.id}>
                <p className="aud-prose">{c.body}</p>
                <span className="aud-muted">{c.name}</span>
                <Report id={c.id} />
              </div>
            ))}
            <div className="aud-card">
              {m ? (
                <Compose kind="comment" tool={tool} />
              ) : (
                <p className="aud-muted">
                  <Link className="aud-link" href="/acesso?origem=ferramenta">
                    Entre na conta gratuita
                  </Link>{" "}
                  para comentar.
                </p>
              )}
            </div>
          </div>
          <aside>
            <div className="aud-card">
              <h3>Sem dados de clientes</h3>
              <p className="aud-muted">
                Use apenas datas e valores. O cálculo só é vinculado à sua conta
                quando você escolhe salvar.
              </p>
              <Link className="aud-link" href="/transparencia/privacidade">
                Como cuidamos dos dados →
              </Link>
            </div>
            <RulesCard />
          </aside>
        </div>
      </div>
    </>
  );
}
