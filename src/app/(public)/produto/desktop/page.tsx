import type { Metadata } from "next";
import Link from "next/link";
import { DesktopShowcase } from "../desktop-showcase";
import { SectionTitle } from "../_parts";

export const metadata: Metadata = {
  title: "LegalOS Desktop",
  description: "A área de trabalho do LegalOS para computador: pastas de clientes, múltiplos processos e informações conectadas, em um ambiente próprio.",
};

const AREAS = [
  ["Casos e processos", "Os diferentes casos e processos do mesmo cliente, com acesso ao cadastro original."],
  ["Trabalho e agenda", "Tarefas, prazos e compromissos vinculados ao cliente ou aos seus processos."],
  ["Conversas", "Conversas vinculadas ao cliente, com acesso ao atendimento no LegalOS Chat."],
  ["Documentos e autos", "Documentos disponíveis e acesso aos autos já incorporados ao sistema. A captura depende das integrações configuradas."],
  ["Intimações", "Publicações ligadas aos processos visíveis para quem está consultando."],
  ["Financeiro e atividade", "Valores a receber, resumo administrativo e registros recentes das rotinas ligadas ao cliente."],
];

export default function DesktopProduct() {
  return <>
    <h1 className="sr-only">LegalOS Desktop — sua área de trabalho por cliente</h1>
    <DesktopShowcase />
    <section className="mx-auto max-w-7xl px-4 py-24">
      <SectionTitle eyebrow="Seu espaço de trabalho" title="Abra uma pasta. Encontre o contexto." text="Uma experiência própria dentro do LegalOS, com identidade em preto e branco, entrada suave e espaço para se concentrar." />
      <ol className="mt-12 grid gap-8 md:grid-cols-3">
        {[
          ["01", "Entre pelo botão Desktop", "A área de trabalho abre sem a barra lateral do Func, mantendo o acesso seguro do escritório."],
          ["02", "Busque nome, CPF ou processo", "A tela começa limpa. As pastas aparecem depois que você faz uma busca."],
          ["03", "Abra o cliente e seus casos", "Consulte os processos e as informações relacionadas sem precisar cadastrar tudo de novo."],
        ].map(([number, title, text]) => <li key={number} className="border-t border-border pt-6"><p className="text-xs text-muted">{number}</p><h2 className="mt-4 text-lg font-medium">{title}</h2><p className="mt-3 text-sm leading-relaxed text-muted">{text}</p></li>)}
      </ol>
    </section>
    <section className="border-y border-border bg-surface-2/60">
      <div className="mx-auto max-w-7xl px-4 py-24">
        <SectionTitle eyebrow="Dentro da pasta" title="Vários processos. Uma visão do cliente." />
        <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-3">{AREAS.map(([title, text]) => <article key={title}><h2 className="font-medium">{title}</h2><p className="mt-3 text-sm leading-relaxed text-muted">{text}</p></article>)}</div>
        <p className="mt-12 max-w-3xl text-sm leading-relaxed text-muted">O Desktop consulta os registros existentes de Func e Chat. Cada seção respeita as permissões, o sigilo dos processos e os vínculos cadastrados. A atividade recente é uma seleção dos registros disponíveis; não substitui a auditoria completa.</p>
      </div>
    </section>
    <section className="mx-auto max-w-4xl px-4 py-24 text-center">
      <p className="text-xs uppercase tracking-[.2em] text-muted">Desktop + RUTE</p>
      <h2 className="mt-4 text-3xl font-medium tracking-tight">Contexto hoje. Novas possibilidades pela frente.</h2>
      <p className="mt-5 text-muted">A pasta oferece um atalho para conversar com a RUTE sobre aquele cliente. A organização automática do ambiente, a interação por voz e a análise conectada a notebooks são ideias para evolução; ainda não fazem parte desta entrega.</p>
      <Link href="/area-de-trabalho" className="mt-8 inline-flex rounded-full bg-fg px-7 py-3 text-sm font-medium text-bg transition hover:opacity-80">Abrir LegalOS Desktop</Link>
      <p className="mt-4 text-xs text-muted">Requer login e acesso aos clientes do escritório. Disponível para computador.</p>
    </section>
  </>;
}
