import type { Metadata } from "next";
import Link from "next/link";
import { Hero } from "../_parts";
export const metadata: Metadata = {
  title: "Ferramentas jurídicas gratuitas",
  alternates: { canonical: "/ferramentas" },
};
export default function Tools() {
  return (
    <>
      <Hero
        eyebrow="Ferramentas LegalOS"
        title="Menos contas à mão. Mais clareza na rotina."
      >
        <p className="aud-lead">
          Use as calculadoras sem cadastro. Para salvar resultados e baixar PDF,
          acesse sua conta pública quando o cadastro estiver disponível.
        </p>
      </Hero>
      <div className="aud-wrap aud-content">
        <div className="aud-columns">
          {[
            [
              "prazos",
              "01",
              "Contagem auxiliar de prazos",
              "Informe a data inicial, a quantidade de dias e o critério de contagem. Veja os dias excluídos e as limitações.",
            ],
            [
              "rescisao",
              "02",
              "Estimativa de verbas rescisórias",
              "Confira uma estimativa bruta com salário, datas e modalidade da rescisão.",
            ],
          ].map(([slug, n, title, desc]) => (
            <article className="aud-card" key={slug}>
              <span className="aud-tag">{n} · Gratuita</span>
              <h2>{title}</h2>
              <p className="aud-muted">{desc}</p>
              <Link className="aud-btn primary" href={"/ferramentas/" + slug}>
                Abrir calculadora →
              </Link>
            </article>
          ))}
        </div>
        <div className="aud-card warning">
          <h3>Uma ajuda para conferir, com critérios visíveis.</h3>
          <p>
            Os resultados são auxiliares. Não substituem revisão profissional,
            regras do tribunal nem cálculo oficial. Não informe dados de
            clientes.
          </p>
        </div>
        <div className="aud-card">
          <h3>Em preparação</h3>
          <p className="aud-muted">
            Atualização de débitos do TJSP e atrasados da Justiça Federal
            dependem da validação dos índices e dos critérios antes da
            disponibilização pública.
          </p>
        </div>
      </div>
    </>
  );
}
