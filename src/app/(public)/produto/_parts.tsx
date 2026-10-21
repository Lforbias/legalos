import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { siteInfo } from "@/config/site";
import { cn } from "@/lib/utils";

/** Contato real definido no ambiente (PUBLIC_CONTACT_WHATSAPP / PUBLIC_CONTACT_EMAIL). Sem contato configurado, leva ao login. Nada inventado. */
export function contact() {
  const s = siteInfo();
  const whatsapp = s.whatsapp ? `https://wa.me/${s.whatsapp}?text=${encodeURIComponent("Olá! Quero conhecer o LegalOS.")}` : null;
  const mail = s.email ? `mailto:${s.email}?subject=${encodeURIComponent("Quero conhecer o LegalOS")}` : null;
  return { whatsapp, mail, href: whatsapp ?? mail, available: Boolean(whatsapp || mail), email: s.email, phone: s.whatsapp, firm: s.firmName };
}

export function CtaLink({ variant = "solid", children = "Falar com a gente", className }: { variant?: "solid" | "ghost" | "light"; children?: React.ReactNode; className?: string }) {
  const c = contact();
  const base = "inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition";
  const style = variant === "solid" ? "bg-white text-[#0a0c13] hover:bg-white/90 shadow-lg shadow-white/10" : variant === "light" ? "bg-fg text-bg hover:opacity-90" : "border border-white/20 text-white hover:bg-white/10";
  const inner = <>{children} <ArrowRight className="h-4 w-4" aria-hidden /></>;
  if (!c.href) return <Link href="/login" className={cn(base, style, className)}>{variant === "light" || variant === "solid" ? "Entrar no sistema" : children}{" "}<ArrowRight className="h-4 w-4" aria-hidden /></Link>;
  return <a href={c.href} target={c.whatsapp ? "_blank" : undefined} rel="noopener noreferrer" className={cn(base, style, className)}>{inner}</a>;
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-text">{children}</p>;
}

export function SectionTitle({ eyebrow, title, text, center = false }: { eyebrow?: string; title: React.ReactNode; text?: string; center?: boolean }) {
  return (
    <div className={cn("max-w-3xl", center && "mx-auto text-center")}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="mt-3 text-3xl font-semibold leading-[1.1] tracking-tight md:text-5xl">{title}</h2>
      {text ? <p className="mt-4 text-base text-muted md:text-lg">{text}</p> : null}
    </div>
  );
}
