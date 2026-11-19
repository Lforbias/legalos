import { SiteShell } from "../site-shell";

/** Páginas internas do site (recursos, planos, segurança…): continuam no visual escuro. */
export default function SecoesLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell dark>{children}</SiteShell>;
}
