import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { settings } from "@/server/audience/store";
import { TERMS_VERSION } from "@/lib/audience/policy";
import { Hero } from "../../_parts";
export const metadata: Metadata = {
  title: "Termos e privacidade",
  robots: { index: false, follow: true },
};
export default async function Legal({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const { page } = await params;
  if (!["termos", "privacidade"].includes(page)) notFound();
  const s = await settings();
  return (
    <>
      <Hero
        eyebrow={"Transparência · " + TERMS_VERSION}
        title={page === "termos" ? "Termos de uso" : "Política de privacidade"}
      />
      <div className="aud-wrap aud-content">
        {!s.legal_approved && (
          <div className="aud-card warning">
            <h3>Minuta para revisão jurídica</h3>
            <p>
              Cadastro e participação permanecem fechados até a aprovação desta
              versão pela assessoria jurídica e a configuração dos responsáveis.
            </p>
          </div>
        )}
        <article className="aud-card aud-prose">
          {page === "termos" ? (
            <>
              <h2>Finalidade do espaço</h2>
              <p>
                O LegalOS oferece conteúdo editorial, ferramentas auxiliares de
                cálculo e um piloto de perguntas e respostas entre
                profissionais. Estes recursos não substituem análise jurídica,
                texto oficial ou cálculo homologado.
              </p>
              <h2>Conta e acesso</h2>
              <p>
                A conta gratuita é separada da conta do escritório. O acesso usa
                Google ou link de e-mail. Você é responsável por manter seu
                acesso protegido. Participação na comunidade depende de convite,
                regras e moderação.
              </p>
              <h2>Conteúdo de participantes</h2>
              <p>
                Publique apenas conteúdo que você tem direito de compartilhar.
                Não informe dados de clientes ou de terceiros. Não é permitido
                spam, captação de clientela ou divulgação de serviços. Você
                autoriza a exibição da sua contribuição no espaço. A moderação
                pode ocultar conteúdo e bloquear contas que violem as regras.
              </p>
              <h2>Correções e remoção</h2>
              <p>
                Use Denunciar para violações em perguntas ou respostas. Pedidos
                de correção editorial, acesso a dados, remoção e outras
                solicitações podem ser encaminhados pela página de contato do
                produto. A equipe analisará a solicitação e comunicará os
                próximos passos.
              </p>
              <h2>Disponibilidade e atualizações</h2>
              <p>
                Recursos podem ser atualizados, interrompidos ou corrigidos. Os
                critérios e as limitações de cada cálculo são apresentados junto
                ao resultado. Mudanças nestes termos exigem uma nova versão e
                registro do aceite.
              </p>
            </>
          ) : (
            <>
              <h2>Dados coletados e finalidades</h2>
              <p>
                Usamos nome e e-mail para identificar a conta e enviar links de
                acesso. No Google, solicitamos somente identificação, nome e
                e-mail. Área e UF são opcionais no perfil. Contribuições
                aprovadas exibem nome e UF para outros participantes.
              </p>
              <h2>Cálculos e preferências</h2>
              <p>
                O uso anônimo de calculadoras registra apenas contagens de uso.
                Datas e valores só ficam vinculados à conta quando você escolhe
                salvar. Não solicite nem informe dados de clientes. Guardamos a
                origem do cadastro para medir o uso do blog, ferramentas e
                comunidade.
              </p>
              <h2>Aceites independentes</h2>
              <p>
                Registramos texto, versão, data, hora e origem do aceite dos
                termos. Novidades e ofertas exigem uma escolha separada,
                opcional e desmarcada. Entrar na conta ou usar uma ferramenta
                não exige aceitar marketing. Você pode cancelar o envio em Minha
                conta e pelo link de saída em cada mensagem.
              </p>
              <h2>Prestadores e proteção</h2>
              <p>
                Os provedores de autenticação e de e-mail recebem os dados
                necessários à sua função. As sessões usam cookies essenciais
                protegidos e tokens armazenados como hash. A conta pública não
                concede acesso a dados de escritórios.
              </p>
              <h2>Retenção e direitos</h2>
              <p>
                Sessões expiram após 30 dias e links de acesso após 15 minutos.
                Dados da conta, contribuições, cálculos salvos e provas de
                aceite ficam armazenados enquanto necessários ao serviço e às
                obrigações aplicáveis. Você pode solicitar acesso, correção,
                portabilidade ou exclusão pela página de contato. A equipe
                avaliará os dados sujeitos a conservação obrigatória antes de
                atender.
              </p>
              <h2>Contato e responsável pelo tratamento</h2>
              <p>
                Use o canal informado em /produto/contato para falar com a
                operação do LegalOS. Antes da abertura pública, a assessoria
                deve confirmar a identificação do controlador, o canal de
                privacidade, os prestadores envolvidos, os prazos de retenção e
                eventuais transferências internacionais.
              </p>
            </>
          )}
        </article>
      </div>
    </>
  );
}
