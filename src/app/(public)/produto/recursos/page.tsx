import type { Metadata } from "next";
import { MODULES, SPACES } from "@/config/showcase";
import { CtaLink, SectionTitle } from "../_parts";
import { BrowserFrame, Reveal } from "../showcase-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Recursos", description: "Tudo o que o LegalOS faz hoje: processos, intimações, prazos, agenda, financeiro, WhatsApp e relatórios." };

const GROUPS = [
  { title: "LegalOS Desktop", items: ["Área de trabalho independente, exclusiva para computador", "Busca por nome, CPF ou processo, com pastas por cliente", "Vários casos e processos reunidos no contexto do cliente", "Trabalho, conversas, documentos, intimações e financeiro conforme suas permissões", "Atividade recente e acesso aos registros originais de Func, Box e Chat"] },
  { title: "Gestão do escritório (Func)", items: ["Clientes (pessoa física e jurídica), contatos e etiquetas", "Processos com partes, equipe, linha do tempo e anotações", "Tarefas com prioridade, responsável e comentários", "Prazos com validação humana e agenda de audiências", "Documentos com versões, modelos e petições", "CRM comercial com funis e automações", "Equipe, produtividade e registro de horas", "Portal do cliente com o que você escolher compartilhar"] },
  { title: "Intimações e tribunais (Box)", items: ["Caixa de entrada jurídica com caixas de trabalho (entrada, minhas, geral, equipes, acervo e adormecidas)", "Captura do DJEN por OAB, com aviso de monitoramento parado", "Consulta do andamento pelo DataJud do CNJ", "Cofre cifrado de certificados digitais A1 e aviso de vencimento", "Conector PJe/MNI para leitura e peticionamento (desligado por padrão, em validação)", "OCR local e busca pelo conteúdo dos documentos"] },
  { title: "Atendimento (Chat)", items: ["WhatsApp pela API oficial da Meta ou por QR-Code", "Fila de atendimento, atribuição, etiquetas e respostas rápidas", "Painel do cliente na conversa: processo, tarefas, agenda, financeiro e documentos", "Robô de atendimento, mensagem de ausência e automações", "Lembretes de cobrança por WhatsApp (desligados até a autorização do escritório)", "Central de interruptores para tudo o que roda sozinho"] },
  { title: "Financeiro e relatórios", items: ["Contas a receber e a pagar, parcelas, baixas e fluxo de caixa", "Categorias, centros de custo e várias contas", "Cobrança da assinatura pelo Asaas (Pix, boleto e cartão)", "Relatórios por permissão com exportação em planilha"] },
  { title: "RUTE, a assistente de IA", items: ["Conecta Claude, ChatGPT e Gemini ao escritório por MCP, com autorização de quem administra", "RUTE lê processos, prazos e clientes e propõe ações; uma pessoa confirma antes de valer", "Assistente dentro do sistema, com conversas privadas e limites por plano e por pessoa", "Biblioteca de modelos e instruções do escritório", "Governança: uso em tokens, histórico de ferramentas e relatório de LGPD"] },
  { title: "Cálculos, portal e rotina", items: ["Cálculos salvos (prazos, atrasados e correção) ligados ao processo", "Copiloto de atendimento durante a conversa com o cliente", "Metas por pessoa e por equipe, com acompanhamento no mês", "Portal do cliente e cobrança integrados ao financeiro"] },
  { title: "Para quem integra", items: ["API pública v1 com chaves de acesso por escopo", "Webhooks assinados com reenvio e histórico de entregas", "Instalável no celular (PWA)", "Painel do administrador da plataforma para suporte e saúde do sistema"] },
];

export default function Recursos() {
  return (
    <>
      <section className="force-dark relative overflow-hidden bg-[#0a0c13] text-fg">
        <div className="prod-grid-bg pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-4xl px-4 py-24 text-center md:py-32">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-text">Recursos</p>
          <h1 className="mt-4 text-5xl font-semibold leading-[1.03] tracking-tight md:text-7xl">Tudo o que o escritório <span className="prod-gradient-text">precisa. Já funcionando.</span></h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/70">Sem promessa de futuro: abaixo está o que existe hoje, com as telas reais do sistema.</p>
        </div>
      </section>

      {MODULES.map((m, i) => (
        <section key={m.id} id={m.id} className={i % 2 ? "bg-surface-2/60 border-y border-border" : ""}>
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 lg:grid-cols-2">
            <Reveal className={i % 2 ? "lg:order-2" : ""}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-text">{m.label}</p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight md:text-4xl">{m.title}</h2>
              <p className="mt-4 text-muted">{m.text}</p>
              <ul className="mt-6 space-y-3">
                {m.points.map((p) => <li key={p} className="flex gap-3 text-sm"><span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span>{p}</span></li>)}
              </ul>
            </Reveal>
            <Reveal delay={120} className={i % 2 ? "lg:order-1" : ""}><BrowserFrame src={m.image} alt={m.alt} /></Reveal>
          </div>
        </section>
      ))}

      <section className="mx-auto max-w-7xl px-4 py-24">
        <SectionTitle center eyebrow="A lista completa" title="Por espaço de trabalho" />
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {GROUPS.map((g, i) => (
            <Reveal key={g.title} delay={(i % 3) * 90}>
              <article className="h-full rounded-3xl border border-border bg-surface p-7">
                <h3 className="font-semibold">{g.title}</h3>
                <ul className="mt-4 space-y-2.5 text-sm text-muted">
                  {g.items.map((it) => <li key={it} className="flex gap-2.5"><span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{it}</li>)}
                </ul>
              </article>
            </Reveal>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-muted">{SPACES.length} espaços de trabalho (Func, Box e Chat) compartilham a mesma base de clientes, processos e permissões.</p>
      </section>

      <section className="force-dark bg-[#0a0c13] text-fg">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">Quer ver isso funcionando?</h2>
          <div className="mt-8 flex justify-center"><CtaLink variant="solid" /></div>
        </div>
      </section>
    </>
  );
}
