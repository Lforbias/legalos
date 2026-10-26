import type { Metadata } from "next";
import { Hero } from "../../_parts";
export const metadata: Metadata = {
  title: "Regras da comunidade",
  robots: { index: false, follow: true },
};
export default function Rules() {
  return (
    <>
      <Hero
        eyebrow="LegalOS Comunidade"
        title="Um espaço de colega para colega."
      >
        <p className="aud-lead">
          Antes de perguntar ou responder, leia as regras de participação.
        </p>
      </Hero>
      <div className="aud-wrap aud-content">
        <article className="aud-card aud-prose">
          <h2>Proteja o sigilo</h2>
          <p>
            Não publique dados de clientes, nomes de partes, documentos,
            contatos, números de processo ou detalhes que permitam identificar
            pessoas. O bloqueio automático de CPF, CNPJ e padrão CNJ é uma
            camada de proteção, não substitui sua conferência.
          </p>
          <h2>Troque conhecimento, não clientes</h2>
          <p>
            Não ofereça serviços, peça indicação de clientes ou publique
            autopromoção, spam e links de afiliados. Não use o espaço para
            captação. As perguntas são de colega para colega.
          </p>
          <h2>Fundamente com respeito</h2>
          <p>
            Responda com contexto, ressalvas e fontes oficiais quando possível.
            Divergências técnicas são bem-vindas; ataques pessoais e
            discriminação não.
          </p>
          <h2>Publicação e moderação</h2>
          <p>
            O piloto é fechado a e-mails convidados. Perguntas, respostas e
            comentários entram na fila de moderação. Use Denunciar para informar
            uma violação. A meta no piloto é analisar denúncias em até 24 horas
            úteis. Conteúdo pode ser ocultado e contas podem ser bloqueadas.
          </p>
          <h2>Limites da participação</h2>
          <p>
            Respostas não constituem parecer jurídico nem relação profissional
            com quem lê. Não há mensagens privadas, anexos, ranking ou
            divulgação de serviços no piloto.
          </p>
          <h2>Busca pública</h2>
          <p>
            Perguntas novas e perguntas sem resposta ficam fora do índice de
            busca. Só perguntas aprovadas com respostas aprovadas são elegíveis
            para indexação. Não criamos perfis ou discussões falsas para simular
            movimento.
          </p>
        </article>
      </div>
    </>
  );
}
