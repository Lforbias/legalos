/* eslint-disable @next/next/no-img-element -- telas do produto já otimizadas em WebP e logos SVG; sem processamento de imagem. */
import type { Metadata } from "next";
import Link from "next/link";
import { DEPARTMENTS } from "@/config/evolution-navigation";
import { COWORK_AREA } from "@/config/office-map";
import { PRICING_FEATURES } from "@/config/pricing-features";
import { COMING_SOON, SECURITY } from "@/config/showcase";
import { ALL_PERMISSIONS } from "@/lib/permissions/catalog";
import { LAUNCH_LABEL } from "@/lib/launch";
import { contact } from "../produto/_parts";
import l from "../produto/landing.module.css";
import a from "./apresentacao.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Apresentação do LegalOS",
  description: "Tudo o que o LegalOS oferece ao escritório de advocacia e o que está chegando. Lançamento em 05.01.2027.",
  robots: { index: true, follow: true },
  openGraph: { title: "LegalOS — apresentação", description: "O sistema operacional do escritório de advocacia. Lançamento em 05.01.2027.", type: "website", locale: "pt_BR" },
};

type Chapter = { id: string; n: string; kicker: string; color: string; title: string; text: string; points: string[]; image?: string; alt?: string };

const CHAPTERS: Chapter[] = [
  {
    id: "mesa", n: "02", kicker: "Minha Mesa", color: DEPARTMENTS.mesa.color,
    title: "O dia de cada pessoa, sem procurar nada.",
    text: "Tarefas, compromissos e prazos de quem está trabalhando, numa agenda só. Da mesa, a pessoa abre a pasta do cliente com processos, conversas e documentos.",
    points: ["Agenda por dia, semana, mês e lista", "Tarefas com checklist, colaboradores e recorrência", "Quadros Kanban de gestão", "Área de trabalho com uma pasta por cliente"],
    image: "/apresentacao/agenda.webp", alt: "Agenda do LegalOS com tarefas e compromissos do mês",
  },
  {
    id: "juridico", n: "03", kicker: "Jurídico", color: DEPARTMENTS.juridico.color,
    title: "Processos e prazos sob controle.",
    text: "Casos e processos com partes, linha do tempo, documentos e honorários. O prazo é calculado em dias úteis ou corridos e só passa a valer depois de conferido por uma pessoa.",
    points: ["Número CNJ validado e processos sigilosos", "Prazos com data fatal, data interna e responsável", "Modelos de documentos com timbrado e prévia em PDF", "Calculadoras: Justiça Federal, TJSP e trabalhista"],
    image: "/apresentacao/processos.webp", alt: "Lista de processos e casos do LegalOS com dados fictícios",
  },
  {
    id: "atendimento", n: "05", kicker: "Atendimento", color: DEPARTMENTS.atendimento.color,
    title: "WhatsApp e e-mail ligados ao processo.",
    text: "A equipe atende em fila, com etiquetas e respostas rápidas. Ao lado da conversa aparecem o cliente, o processo, as tarefas e o financeiro, e dá para criar tarefa ou prazo na hora.",
    points: ["API oficial da Meta ou conexão por QR-Code", "Filas, atribuição, notas internas e SLA", "Copiloto que sugere a resposta; a equipe revisa", "Campanhas com aprovação, opt-out e agendamento"],
    image: "/apresentacao/atendimento.webp", alt: "Conversa de WhatsApp no LegalOS com o painel do cliente ao lado",
  },
  {
    id: "financeiro", n: "07", kicker: "Financeiro & Contábil", color: DEPARTMENTS.financeiro.color,
    title: "Honorários e despesas, centavo por centavo.",
    text: "Contas a receber e a pagar, parcelas, baixas, conciliação e fluxo de caixa, ligados ao cliente e ao processo. Valores em reais, sem arredondamento.",
    points: ["Lançamentos parcelados e contratos de êxito", "Categorias, centros de custo e várias contas", "Cobrança por Pix e boleto (Asaas)", "Exportação em planilha"],
    image: "/apresentacao/financeiro.webp", alt: "Visão geral do financeiro com valores a receber e a pagar",
  },
  {
    id: "gestao", n: "08", kicker: "Administração & Gestão", color: DEPARTMENTS.administracao.color,
    title: "Os números do escritório, calculados agora.",
    text: "Indicadores, relatórios e metas da equipe a partir dos dados reais. Cada pessoa vê só o que o perfil dela permite.",
    points: ["Indicadores e central de alertas", "Relatórios com exportação e metas por pessoa", "Automações entre áreas, com botão de ligar e desligar", "API REST, MCP e webhooks assinados"],
    image: "/apresentacao/indicadores.webp", alt: "Indicadores do escritório com tarefas, prazos e honorários",
  },
  {
    id: "cowork", n: "09", kicker: "LegalOS Cowork", color: COWORK_AREA.color,
    title: "A equipe junta, dentro do sistema.",
    text: "Canais por departamento, conversas diretas e reuniões. Cada processo pode ter a própria sala, que respeita o sigilo do processo. Nada se mistura com o WhatsApp dos clientes.",
    points: ["Canais, grupos e conversas em tempo real", "Sala do processo com o mesmo sigilo do processo", "Mensagem vira tarefa sem copiar e colar", "Reuniões internas da equipe"],
    image: "/apresentacao/cowork.webp", alt: "Cowork do LegalOS com canais por departamento",
  },
];

const SPECIAL = [
  { title: "Google Drive integrado", status: "Disponível", text: "Uma pasta por cliente no Drive do próprio escritório. Envie documentos como Google Docs, edite lá e traga a versão de volta. Processos sigilosos nunca vão para o Drive." },
  { title: "Área de trabalho por cliente", status: "Disponível", text: "Busque o cliente e abra a pasta dele, com processos, conversas, documentos e financeiro num só lugar." },
  { title: "Claude, ChatGPT ou Gemini", status: "Disponível", text: "Quem já usa uma dessas IAs conecta com o login do LegalOS e consulta o escritório de dentro dela, com as mesmas permissões." },
  { title: "Calculadoras jurídicas", status: "Disponível", text: "Atrasados da Justiça Federal, débito do TJSP e atualização trabalhista, salvos no processo com memorial e planilha." },
  { title: "Migração do Astrea", status: "Disponível", text: "Traga clientes, processos e o histórico do sistema antigo, sem redigitar." },
  { title: "Aplicativo no celular", status: "Disponível", text: "Instala na tela inicial do Android ou do iPhone, sem loja, com avisos opcionais de prazos e tarefas a vencer." },
];

const FUNNEL = ["Identificado", "Qualificado", "Contato", "Demonstração", "Proposta", "Ganho"];

const NOTES = [
  { when: "08:02 · Minha Mesa", text: "Você tem 3 prazos nesta semana. O de quinta ainda não foi conferido." },
  { when: "10:30 · Atendimento", text: "A cliente perguntou do processo. O último andamento foi ontem." },
  { when: "16:45 · Cowork", text: "Reunião da equipe às 17h, na sala do processo." },
];

const AVAILABLE = ["Seis departamentos e a Minha Mesa", "Processos, prazos, documentos e cálculos", "WhatsApp e e-mail da equipe", "CRM, funil e portal do cliente", "Financeiro com Pix e boleto", "Indicadores, relatórios e metas", "Cowork da equipe", "Google Drive integrado", "RUTE com aprovação humana", "Aplicativo no celular (PWA)"];

export default function Apresentacao() {
  const features = PRICING_FEATURES.reduce((n, g) => n + g.features.length, 0);
  const c = contact();
  const STATS = [
    { n: "6", label: "departamentos, cada um com seu menu" },
    { n: String(features), label: "recursos e operações no catálogo" },
    { n: String(ALL_PERMISSIONS.length), label: "permissões para montar os perfis" },
  ];
  const toc = [["01", "Visão geral", "#visao"], ["02", "Departamentos", "#mesa"], ["04", "Protocolo", "#protocolo"], ["10", "Especiais", "#especiais"], ["11", "RUTE", "#rute"], ["13", "O que vem", "#roadmap"]];

  return (
    <div className={l.page}>
      <div className={l.grain} aria-hidden="true" />
      <p className={`${l.bar} ${l.mono}`}><strong>Apresentação</strong> · Lançamento em {LAUNCH_LABEL}</p>

      <header className={a.hero}>
        <nav className={l.nav} aria-label="Principal">
          <div className={l.navLeft}>
            <a className={`${l.mono} ${l.navLink}`} href="#mesa">Departamentos</a>
            <a className={`${l.mono} ${l.navLink}`} href="#roadmap">O que vem</a>
            <a className={`${l.mono} ${l.navLink}`} href="#seguranca">Segurança</a>
          </div>
          <Link href="/produto" aria-label="LegalOS, página inicial"><img className={l.logo} src="/brand/legalos-horizontal-dark.svg" alt="LegalOS" width={96} height={24} /></Link>
          <div className={l.navRight}>
            <a className={`${l.mono} ${l.navLink} ${l.navAccent}`} href="#conversar">Falar com o comercial</a>
          </div>
        </nav>

        <div className={a.heroInner}>
          <div>
            <p className={`${l.mono}`} style={{ color: "#ff8490", margin: 0 }}>LegalOS · apresentação</p>
            <h1 className={a.heroTitle}>O escritório inteiro. <em>Num só</em> sistema.</h1>
            <p className={a.heroLead}>Tudo o que o LegalOS faz hoje pelo escritório de advocacia e o que está chegando. Telas reais, com dados fictícios.</p>
          </div>
          <ol className={`${a.toc} ${l.mono}`} aria-label="Nesta apresentação">
            {toc.map(([n, label, href]) => <li key={href}><a href={href}><span>{n} · {label}</span><span aria-hidden="true">↓</span></a></li>)}
          </ol>
        </div>

        <div className={a.stage}>
          <div className={a.stageShot}><img src="/apresentacao/lobby.webp" alt="Lobby do LegalOS: o resumo do dia e os departamentos do escritório" width={1440} height={900} /></div>
        </div>
        <div className={a.horizon} aria-hidden="true" />
        <div className={a.heroBottom} aria-hidden="true" />
      </header>

      <main>
        <section id="visao" className={l.section} aria-labelledby="visao-titulo">
          <div className={l.wrap}>
            <p className={`${l.kicker} ${l.mono}`}>01 / Visão geral</p>
            <h2 id="visao-titulo" className={l.h2}>Cada área no seu lugar.<br />Todas conversando.</h2>
            <p className={l.lead}>O menu segue a rotina do escritório. Quem é do Jurídico abre o Jurídico; quem atende abre o Atendimento. E tudo continua ligado ao mesmo cliente e ao mesmo processo.</p>
            <ul className={a.stats} style={{ marginTop: 48 }}>
              {STATS.map((s) => <li key={s.label}><b>{s.n}</b><span className={l.mono}>{s.label}</span></li>)}
            </ul>
          </div>
        </section>

        {CHAPTERS.slice(0, 2).map((ch, i) => <ChapterSection key={ch.id} ch={ch} reverse={i % 2 === 1} />)}

        <section id="protocolo" className={`${l.section} ${l.dark} ${a.dark}`} aria-labelledby="protocolo-titulo" data-testid="apres-protocolo">
          <div className={`${l.wrap} ${a.chapter}`}>
            <div>
              <p className={`${l.kicker} ${l.mono}`}>04 / Protocolo nos tribunais · em breve</p>
              <h2 id="protocolo-titulo" className={l.h2}><span className={a.deptDot} style={{ background: DEPARTMENTS.juridico.color }} aria-hidden="true" />Do processo ao tribunal, sem sair do LegalOS.</h2>
              <p className={l.lead}>Em desenvolvimento: a petição pronta será protocolada direto do processo, com o certificado digital do advogado, e o comprovante voltará para o caso. Ainda não faz parte da versão de lançamento.</p>
              <ol className={a.points}>
                {["Petição enviada a partir do próprio processo", "Certificado digital guardado cifrado", "Fila de protocolos com acompanhamento", "Comprovante salvo no processo, com quem protocolou e quando"].map((p, j) => <li key={p}><span className={l.mono}>{String(j + 1).padStart(2, "0")}</span>{p}</li>)}
              </ol>
              <p className={`${a.launchTag} ${l.mono}`}>Em breve · depois do lançamento</p>
            </div>
            <ol className={`${a.flow} ${l.mono}`} aria-label="Como funciona o protocolo">
              {["Petição pronta no processo", "Assinatura com certificado digital", "Protocolo no tribunal", "Comprovante de volta no caso"].map((step, j) => <li key={step}><span>{String(j + 1).padStart(2, "0")}</span>{step}</li>)}
            </ol>
          </div>
        </section>

        {CHAPTERS.slice(2, 3).map((ch) => <ChapterSection key={ch.id} ch={ch} reverse={false} />)}

        <section id="comercial" className={l.section} aria-labelledby="comercial-titulo">
          <div className={`${l.wrap} ${a.chapter}`}>
            <div>
              <p className={`${l.kicker} ${l.mono}`}>06 / Comercial</p>
              <h2 id="comercial-titulo" className={l.h2}><span className={a.deptDot} style={{ background: DEPARTMENTS.comercial.color }} aria-hidden="true" />Do primeiro contato ao contrato.</h2>
              <p className={l.lead}>Leads e oportunidades num funil, com a conversa de origem, o responsável e o próximo passo. Quando fecha, o cliente e o processo já nascem cadastrados.</p>
              <ol className={`${a.points}`}>
                {["Funil com etapas e responsável", "Oportunidade nasce da conversa no WhatsApp", "Portal do cliente com o andamento em linguagem simples", "Só aparece no portal o que o escritório marcar"].map((p, j) => <li key={p}><span className={l.mono}>{String(j + 1).padStart(2, "0")}</span>{p}</li>)}
              </ol>
            </div>
            <ol className={`${a.funnel} ${l.mono}`} aria-label="Exemplo de funil">
              {FUNNEL.map((stage, j) => <li key={stage} style={{ width: `${100 - j * 9}%` }}><span>{stage}</span><span>{String(j + 1).padStart(2, "0")}</span></li>)}
            </ol>
          </div>
        </section>

        {CHAPTERS.slice(3).map((ch, i) => <ChapterSection key={ch.id} ch={ch} reverse={i % 2 === 0} />)}

        <section id="especiais" className={l.section} aria-labelledby="especiais-titulo">
          <div className={l.wrap}>
            <p className={`${l.kicker} ${l.mono}`}>10 / Funcionalidades especiais</p>
            <h2 id="especiais-titulo" className={l.h2}>O que faz diferença<br />no dia a dia.</h2>
            <ul className={a.special}>
              {SPECIAL.map((f) => (
                <li key={f.title} className={a.specialCell} data-testid="apres-especial">
                  <span className={`${l.mono} ${f.status === "Disponível" ? a.tagOk : a.tagSoon}`}>{f.status}</span>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="rute" className={`${l.section} ${l.dark} ${a.dark}`} aria-labelledby="rute-titulo">
          <div className={l.wrap}>
            <p className={`${l.kicker} ${l.mono}`}>11 / Inteligência</p>
            <h2 id="rute-titulo" className={l.h2}>A RUTE propõe.<br />Uma pessoa decide.</h2>
            <p className={l.lead}>A IA do escritório consulta o sistema com as permissões de quem pergunta e mostra de onde tirou cada resposta. Tarefa, prazo, anotação ou minuta viram propostas: só valem depois que alguém aprova.</p>
            <ul className={l.notes} aria-label="Exemplos ilustrativos">
              {NOTES.map((n) => <li key={n.when} className={l.note}><span className={l.mono}>{n.when}</span><p>{n.text}</p></li>)}
            </ul>
            <ol className={a.points} style={{ maxWidth: 720 }}>
              {["Funciona com Claude, ChatGPT ou Gemini, com a chave do escritório", "CPF, CNPJ e e-mails ocultados antes de sair para a IA", "Limites por perfil, relatório de uso e relatório de LGPD", "Nunca protocola e nunca fala com o cliente sozinha"].map((p, j) => <li key={p}><span className={l.mono}>{String(j + 1).padStart(2, "0")}</span>{p}</li>)}
            </ol>
            <p className={l.fine}>Exemplos ilustrativos. A RUTE nasce desligada em cada escritório e só funciona depois que a administração configura e autoriza.</p>
          </div>
        </section>

        <section id="seguranca" className={`${l.section} ${l.dark} ${a.dark}`} style={{ borderTop: "1px solid rgba(255,255,255,.08)" }} aria-labelledby="seg-titulo">
          <div className={l.wrap}>
            <p className={`${l.kicker} ${l.mono}`}>12 / Segurança</p>
            <h2 id="seg-titulo" className={l.h2}>Privado por padrão.</h2>
            <ul className={a.secGrid}>
              {SECURITY.map((s, j) => <li key={s.title}><span className={`${l.mono} ${a.mono}`}>{String(j + 1).padStart(2, "0")}</span><h3>{s.title}</h3><p>{s.text}</p></li>)}
            </ul>
          </div>
        </section>

        <section id="roadmap" className={l.section} aria-labelledby="roadmap-titulo">
          <div className={l.wrap}>
            <p className={`${l.kicker} ${l.mono}`}>13 / O que vem</p>
            <h2 id="roadmap-titulo" className={l.h2}>Hoje, no lançamento<br />e depois.</h2>
            <ol className={a.track}>
              <li className={`${a.stop} ${a.stopNow}`}><span className={l.mono}>Hoje</span><h3>Já funciona</h3><ul>{AVAILABLE.map((t) => <li key={t}>{t}</li>)}</ul></li>
              <li className={`${a.stop} ${a.stopLaunch}`}><span className={l.mono} style={{ color: "#d61f35" }}>{LAUNCH_LABEL}</span><h3>Lançamento</h3><ul><li>Abertura para novos escritórios</li><li>Demonstração e implantação com o nosso time</li><li>Migração de dados de outros sistemas</li></ul></li>
              <li className={a.stop}><span className={l.mono}>Depois</span><h3>Em construção</h3><ul>{COMING_SOON.map((t) => <li key={t}>{t}</li>)}<li>Protocolo integrado aos tribunais</li><li>Captura de publicações e autos (Central Judicial)</li></ul></li>
            </ol>
          </div>
        </section>

        <section id="conversar" className={`${l.section} ${l.dark} ${a.dark}`} aria-labelledby="conversar-titulo">
          <div className={l.wrap}>
            <p className={`${l.kicker} ${l.mono}`}>Próximo passo</p>
            <h2 id="conversar-titulo" className={l.h2}>Vamos ver isso<br />no seu escritório?</h2>
            <p className={l.lead}>Mostramos o LegalOS funcionando com os seus casos de exemplo e montamos a implantação junto com a sua equipe.</p>
            <div className={a.ctaBox}>
              {c.whatsapp ? <a className={`${l.btn} ${l.btnRed}`} href={c.whatsapp} target="_blank" rel="noopener noreferrer" data-testid="apres-whatsapp">Falar no WhatsApp →</a> : null}
              {c.mail ? <a className={`${l.btn} ${l.btnRed}`} href={c.mail} data-testid="apres-email">Responder por e-mail →</a> : null}
              <Link className={`${l.btn} ${c.available ? l.btnLine : l.btnRed}`} href="/produto#interesse" style={c.available ? { borderColor: "#f2f2ee", color: "#f2f2ee" } : undefined}>Registrar interesse →</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className={`${l.footer} ${l.mono}`}>
        <img className={l.logo} src="/brand/legalos-horizontal-light.svg" alt="LegalOS" width={88} height={22} style={{ height: 22 }} />
        <nav aria-label="Rodapé">
          <Link href="/produto">Início</Link>
          <Link href="/produto/seguranca">Segurança</Link>
          <Link href="/login">Entrar</Link>
        </nav>
        <span>© {new Date().getFullYear()} LegalOS</span>
      </footer>
    </div>
  );
}

function ChapterSection({ ch, reverse }: { ch: Chapter; reverse: boolean }) {
  return (
    <section id={ch.id} className={l.section} aria-labelledby={`${ch.id}-titulo`} data-testid={`apres-${ch.id}`}>
      <div className={`${l.wrap} ${a.chapter} ${reverse ? a.reverse : ""}`}>
        <div>
          <p className={`${l.kicker} ${l.mono}`}>{ch.n} / {ch.kicker}</p>
          <h2 id={`${ch.id}-titulo`} className={l.h2}><span className={a.deptDot} style={{ background: ch.color }} aria-hidden="true" />{ch.title}</h2>
          <p className={l.lead}>{ch.text}</p>
          <ol className={a.points}>
            {ch.points.map((p, j) => <li key={p}><span className={l.mono}>{String(j + 1).padStart(2, "0")}</span>{p}</li>)}
          </ol>
        </div>
        {ch.image ? (
          <figure style={{ margin: 0 }}>
            <div className={l.frame}><img src={ch.image} alt={ch.alt ?? ""} width={1440} height={900} loading="lazy" /></div>
            <figcaption className={`${l.caption} ${l.mono}`}>Tela real · dados fictícios</figcaption>
          </figure>
        ) : null}
      </div>
    </section>
  );
}
