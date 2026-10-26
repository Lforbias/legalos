import Link from "next/link";
import type { Metadata } from "next";
import { viewer } from "@/server/audience/auth";
import { settings } from "@/server/audience/store";
import { Compose } from "../../_forms";
import { RulesCard } from "../../_parts";
export const metadata: Metadata = {
  title: "Fazer uma pergunta",
  robots: { index: false, follow: false },
};
export default async function New() {
  const m = await viewer(),
    s = await settings();
  return (
    <div className="aud-wrap aud-content">
      <p className="aud-breadcrumb">
        <Link href="/comunidade">Comunidade</Link> / Fazer pergunta
      </p>
      <h1>Qual é a sua dúvida?</h1>
      <div className="aud-grid">
        <div className="aud-card">
          {m?.invited && s.community_enabled && s.legal_approved ? (
            <Compose kind="question" />
          ) : (
            <>
              <h3>Estamos em piloto fechado</h3>
              <p>
                Para publicar, você precisa de uma conta e de um convite da
                equipe. O piloto só abre com moderação definida.
              </p>
              <Link
                href={m ? "/produto/contato" : "/acesso?origem=comunidade"}
                className="aud-btn primary"
              >
                {m ? "Falar com a equipe" : "Entrar na conta gratuita"}
              </Link>
            </>
          )}
        </div>
        <aside>
          <RulesCard />
        </aside>
      </div>
    </div>
  );
}
