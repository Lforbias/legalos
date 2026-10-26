import type { Metadata } from "next";
import Link from "next/link";
import { viewer } from "@/server/audience/auth";
import { publicUrl } from "@/lib/audience/policy";
import "./audience.css";
export const metadata: Metadata = {
  title: {
    default: "LegalOS — conteúdo e ferramentas",
    template: "%s · LegalOS",
  },
  metadataBase: new URL(publicUrl()),
  robots: { index: true, follow: true },
};
const nav: [string, string][] = [
  ["/produto", "Início"],
  ["/produto/recursos", "Recursos"],
  ["/blog", "Blog"],
  ["/ferramentas", "Ferramentas"],
  ["/comunidade", "Comunidade"],
  ["/produto/seguranca", "Segurança"],
  ["/produto/contato", "Contato"],
];
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const m = await viewer();
  return (
    <div className="audience">
      <header className="aud-head">
        <div className="aud-wrap">
          <Link className="aud-brand" href="/produto">
            <i aria-hidden />
            LegalOS
          </Link>
          <nav aria-label="Principal" className="aud-nav">
            {nav.map(([href, label]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="aud-access">
            <Link href={m ? "/minha-conta" : "/acesso"}>
              {m ? "Minha conta" : "Entrar"}
            </Link>
            <Link className="aud-btn primary" href="/login">
              Entrar no sistema
            </Link>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="aud-footer">
        <div className="aud-wrap">
          <div>
            <Link className="aud-brand" href="/produto">
              LegalOS
            </Link>
            <p>
              Gestão do escritório, caixa de intimações e atendimento em um só
              lugar. Conteúdo para a rotina de quem advoga.
            </p>
          </div>
          <div>
            <b>Explorar</b>
            {nav.slice(2, 6).map(([href, label]) => (
              <Link href={href} key={href}>
                {label}
              </Link>
            ))}
          </div>
          <div>
            <b>Acesso</b>
            <Link href="/acesso">Conta gratuita</Link>
            <Link href="/login">Entrar no sistema</Link>
            <Link href="/produto/contato">Pedir demonstração</Link>
          </div>
          <div>
            <b>Transparência</b>
            <Link href="/blog/como-produzimos">Como produzimos</Link>
            <Link href="/blog/correcoes">Correções</Link>
            <Link href="/transparencia/termos">Termos de uso</Link>
            <Link href="/transparencia/privacidade">
              Política de privacidade
            </Link>
            <Link href="/comunidade/regras">Regras da comunidade</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
