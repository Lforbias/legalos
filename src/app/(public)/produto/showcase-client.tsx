"use client";

import Image from "next/image";
import * as React from "react";
import type { ModuleShot } from "@/config/showcase";

/** Revela o conteúdo ao rolar (com "reduzir movimento" o CSS já mostra tudo). */
export function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { el.classList.add("is-in"); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("is-in"); io.disconnect(); }
    }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`prod-reveal ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>{children}</div>;
}

export function BrowserFrame({ src, alt, priority = false, className = "" }: { src: string; alt: string; priority?: boolean; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-white/10 bg-[#0a0c13] shadow-2xl shadow-black/40 ${className}`}>
      <div className="flex items-center gap-1.5 border-b border-white/10 bg-[#11141e] px-4 py-2.5" aria-hidden>
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" /><span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" /><span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 truncate rounded-md bg-white/5 px-3 py-0.5 text-[11px] text-white/50">legalossync.tech</span>
      </div>
      <Image src={src} alt={alt} width={1800} height={1125} unoptimized priority={priority} className="block h-auto w-full" />
    </div>
  );
}

export function ModuleTabs({ modules }: { modules: ModuleShot[] }) {
  const [active, setActive] = React.useState(modules[0]!.id);
  const m = modules.find((x) => x.id === active) ?? modules[0]!;
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = modules[(i + (e.key === "ArrowRight" ? 1 : modules.length - 1)) % modules.length]!;
    setActive(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };
  return (
    <div>
      <div role="tablist" aria-label="Módulos do LegalOS" className="mb-8 flex flex-wrap justify-center gap-2">
        {modules.map((x, i) => (
          <button
            key={x.id} id={`tab-${x.id}`} role="tab" type="button" aria-selected={active === x.id} aria-controls={`panel-${x.id}`} tabIndex={active === x.id ? 0 : -1}
            onClick={() => setActive(x.id)} onKeyDown={(e) => onKey(e, i)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${active === x.id ? "border-transparent bg-fg text-bg shadow-lg" : "border-border bg-surface text-muted hover:border-border-strong hover:text-fg"}`}
          >{x.label}</button>
        ))}
      </div>
      <div id={`panel-${m.id}`} role="tabpanel" aria-labelledby={`tab-${m.id}`} className="grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <h3 className="text-2xl font-semibold tracking-tight md:text-3xl">{m.title}</h3>
          <p className="mt-3 text-base text-muted">{m.text}</p>
          <ul className="mt-6 space-y-3">
            {m.points.map((p) => (
              <li key={p} className="flex gap-3 text-sm"><span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /><span>{p}</span></li>
            ))}
          </ul>
        </div>
        <BrowserFrame src={m.image} alt={m.alt} />
      </div>
    </div>
  );
}
