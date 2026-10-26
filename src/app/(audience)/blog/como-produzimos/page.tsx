import type { Metadata } from "next";
import { Hero } from "../../_parts";
export const metadata: Metadata = {
  title: "Como produzimos o conteúdo",
  alternates: { canonical: "/blog/como-produzimos" },
};
export default function Editorial() {
  return (
    <>
      <Hero
        eyebrow="Transparência editorial"
        title="Fonte primeiro. Revisão sempre."
      >
        <p className="aud-lead">
          Conteúdo que ajuda a conferir o que mudou na prática, sem substituir o
          texto oficial.
        </p>
      </Hero>
      <div className="aud-wrap aud-content">
        <article className="aud-card aud-prose">
          <h2>O que entra no blog</h2>
          <p>
            Leis, decisões e atos oficiais com efeito sobre peças, prazos,
            documentos e cálculos. Priorizamos utilidade, não volume.
          </p>
          <h2>Fontes oficiais</h2>
          <p>
            Usamos documentos do Planalto, Diário Oficial, tribunais, CNJ e
            INSS. Cada post traz órgão, link original, data do documento e data
            de acesso. Não copiamos notícias de outros sites.
          </p>
          <h2>Rascunho e revisão</h2>
          <p>
            A IA pode ajudar a preparar rascunhos. Um responsável humano confere
            fonte, vigência, números e prazos antes de aprovar a publicação. A
            autoria editorial é da Equipe editorial LegalOS. A meta inicial é um
            post útil por dia; urgências são identificadas no processo de
            aprovação.
          </p>
          <h2>Atualizações e correções</h2>
          <p>
            Mostramos a data de atualização e a nota de correção no artigo.
            Alterações voltam para revisão antes de aparecerem publicamente. O
            histórico de correções fica em /blog/correcoes.
          </p>
          <h2>Conteúdo da comunidade</h2>
          <p>
            Perguntas e respostas são contribuições de participantes, não
            orientação jurídica oficial do LegalOS. A moderação pode remover
            dados pessoais, spam e ofertas de serviços.
          </p>
        </article>
      </div>
    </>
  );
}
