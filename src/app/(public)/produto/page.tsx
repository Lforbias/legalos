/* eslint-disable @next/next/no-img-element -- logos SVG e a tela do produto já otimizada; sem processamento de imagem. */
import Link from "next/link";
import { OFFICE_AREAS, areaInfo } from "@/config/office-map";
import { LAUNCH_AT, LAUNCH_LABEL, launchCountdown } from "@/lib/launch";
import { Countdown } from "@/modules/launch/countdown";
import { InterestForm } from "@/modules/launch/interest-form";
import { contact } from "./_parts";
import { canSignUp } from "./site-shell";
import s from "./landing.module.css";

export const dynamic = "force-dynamic";

const LETTERS = ["L", "E", "G", "A", "L", "O", "S"];

const NOTES = [
  { when: "08:02 · Minha Mesa", text: "Você tem 3 prazos nesta semana. O de quinta ainda não foi conferido." },
  { when: "10:30 · Atendimento", text: "A cliente perguntou do processo. O último andamento foi ontem." },
  { when: "16:45 · Cowork", text: "Reunião da equipe às 17h, na sala do processo." },
];

export default function LaunchLanding() {
  const now = new Date().getTime();
  const launched = launchCountdown(new Date(now), LAUNCH_AT).done;
  const signUp = canSignUp();
  const wa = contact().whatsapp;

  return (
    <div className={s.page}>
      <div className={s.grain} aria-hidden="true" />
      <a href="#interesse" className={s.srOnly}>Ir para o formulário de interesse</a>
      <p className={`${s.bar} ${s.mono}`}>
        {launched ? <strong>O LegalOS chegou</strong> : <><strong>Lançamento em {LAUNCH_LABEL}</strong> · Conheça o LegalOS no nosso estande</>}
      </p>

      <header className={s.hero}>
        <nav className={s.nav} aria-label="Principal">
          <div className={s.navLeft}>
            <a className={`${s.mono} ${s.navLink}`} href="#produto">Produto</a>
            <a className={`${s.mono} ${s.navLink}`} href="#departamentos">Departamentos</a>
            <a className={`${s.mono} ${s.navLink}`} href="#interesse">Interesse</a>
          </div>
          <Link href="/produto" aria-label="LegalOS, página inicial"><img className={s.logo} src="/brand/legalos-horizontal-dark.svg" alt="LegalOS" width={96} height={24} /></Link>
          <div className={s.navRight}>
            <Link className={`${s.mono} ${s.navLink} ${s.navAccent}`} href="/login" data-testid="site-entrar">Entrar</Link>
            {signUp ? <Link className={`${s.mono} ${s.navLink}`} href="/register" data-testid="site-criar-conta">Criar conta</Link> : null}
          </div>
        </nav>

        <div className={s.word} aria-hidden="true">
          {LETTERS.map((l, i) => <span key={i} style={{ animationDelay: `${i * 80}ms` }}>{l}</span>)}
        </div>
        <div className={s.planet} aria-hidden="true" />
        <div className={s.mark} aria-hidden="true"><i className={s.block} /><i className={`${s.block} ${s.dot}`} /><i className={s.block} /><i className={s.block} /></div>

        <div className={s.heroFoot}>
          <div>
            <h1 className={s.heroTitle}>O sistema operacional do escritório de advocacia</h1>
            <ul className={`${s.chips} ${s.mono}`} aria-label="Destaques">
              <li className={s.chip}>Por departamentos</li>
              <li className={s.chip}>RUTE · IA supervisionada</li>
              <li className={s.chip}>Cowork da equipe</li>
              <li className={s.chip}>WhatsApp integrado</li>
            </ul>
          </div>
          <div className={s.cta}>
            <p className={`${s.tag} ${s.mono}`}>{launched ? "Disponível agora" : "Lista de interesse aberta"}</p>
            {launched ? null : <><p className={s.srOnly}>Lançamento em 5 de janeiro de 2027.</p><Countdown className={`${s.count} ${s.mono}`} initialNow={now} /></>}
            <a className={`${s.btn} ${s.btnRed}`} href="#interesse" data-testid="cta-interesse">Registrar interesse →</a>
            {wa ? <a className={`${s.btn} ${s.btnLine}`} href={wa} target="_blank" rel="noopener noreferrer" data-testid="cta-whatsapp">Falar no WhatsApp</a> : null}
          </div>
        </div>
      </header>

      <main>
        <section id="produto" className={s.section} aria-labelledby="produto-titulo">
          <div className={`${s.wrap} ${s.split}`}>
            <div>
              <p className={`${s.kicker} ${s.mono}`}>01 / Produto</p>
              <h2 id="produto-titulo" className={s.h2}>Cada área no seu lugar. Todas conversando.</h2>
              <p className={s.lead}>Processos, prazos, atendimento por WhatsApp, CRM, financeiro e a equipe num só sistema, organizado do jeito que o escritório trabalha.</p>
              <p style={{ marginTop: 28 }}><a className={`${s.btn} ${s.btnRed}`} href="#interesse">Quero conhecer →</a></p>
            </div>
            <figure style={{ margin: 0 }}>
              <div className={s.frame}><img src="/produto/lobby.webp" alt="Lobby do LegalOS com o resumo do dia e os departamentos do escritório" width={1440} height={900} loading="lazy" /></div>
              <figcaption className={`${s.caption} ${s.mono}`}>Tela real · dados fictícios</figcaption>
            </figure>
          </div>
        </section>

        <section id="departamentos" className={s.section} aria-labelledby="dep-titulo">
          <div className={s.wrap}>
            <p className={`${s.kicker} ${s.mono}`}>02 / Departamentos</p>
            <h2 id="dep-titulo" className={s.h2}>O menu segue a rotina do escritório.</h2>
            <ul className={s.grid}>
              {OFFICE_AREAS.map((d) => {
                const info = areaInfo(d);
                return (
                  <li key={d} className={s.cell} data-testid={`home-area-${d}`}>
                    <span className={s.swatch} style={{ background: info.color }} aria-hidden="true" />
                    <div><h3>{info.name}</h3><p>{info.summary}</p></div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className={`${s.section} ${s.dark}`} aria-labelledby="rute-titulo" data-testid="home-rute">
          <div className={s.wrap}>
            <p className={`${s.kicker} ${s.mono}`}>03 / Inteligência</p>
            <h2 id="rute-titulo" className={s.h2}>A RUTE propõe.<br />Uma pessoa decide.</h2>
            <p className={s.lead}>A IA do escritório consulta o sistema com as permissões de quem pergunta e mostra de onde tirou cada resposta. Nada é criado ou enviado sem confirmação.</p>
            <ul className={s.notes} aria-label="Exemplos ilustrativos">
              {NOTES.map((n) => <li key={n.when} className={s.note}><span className={s.mono}>{n.when}</span><p>{n.text}</p></li>)}
            </ul>
            <p className={s.fine}>Exemplos ilustrativos. A RUTE nasce desligada em cada escritório e só funciona depois que a administração configura e autoriza.</p>
          </div>
        </section>

        <section id="interesse" className={s.section} aria-labelledby="interesse-titulo">
          <div className={`${s.wrap} ${s.split}`} style={{ alignItems: "start" }}>
            <div>
              <p className={`${s.kicker} ${s.mono}`}>04 / Lançamento · {LAUNCH_LABEL}</p>
              <h2 id="interesse-titulo" className={s.h2}>Seja um dos primeiros escritórios.</h2>
              <p className={s.lead}>Deixe seu contato e o nosso comercial fala com você antes do lançamento, com uma demonstração no seu escritório.</p>
            </div>
            <InterestForm s={{ form: s.form, row: s.row, field: s.field, input: s.input, error: s.error, consent: s.consent, trap: s.trap, btn: s.btn, btnRed: s.btnRed, done: s.done, mono: s.mono }} />
          </div>
        </section>
      </main>

      <footer className={`${s.footer} ${s.mono}`}>
        <img className={s.logo} src="/brand/legalos-horizontal-light.svg" alt="LegalOS" width={88} height={22} style={{ height: 22 }} />
        <nav aria-label="Rodapé">
          <Link href="/login">Entrar</Link>
          {signUp ? <Link href="/register">Criar conta</Link> : null}
          <Link href="/produto/seguranca">Segurança</Link>
          <Link href="/produto/contato">Contato</Link>
        </nav>
        <span>© {new Date().getFullYear()} LegalOS</span>
      </footer>
    </div>
  );
}
