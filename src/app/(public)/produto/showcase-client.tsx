"use client";

import Image from "next/image";
import * as React from "react";
import type { ModuleShot } from "@/config/showcase";

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
    <div className={`overflow-hidden rounded-2xl border border-border/50 shadow-xl shadow-black/10 ${className}`}>
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
      <div role="tablist" aria-label="Módulos do LegalOS" className="mb-10 flex flex-wrap justify-center gap-2">
        {modules.map((x, i) => (
          <button
            key={x.id} id={`tab-${x.id}`} role="tab" type="button" aria-selected={active === x.id} aria-controls={`panel-${x.id}`} tabIndex={active === x.id ? 0 : -1}
            onClick={() => setActive(x.id)} onKeyDown={(e) => onKey(e, i)}
            className={`rounded-full px-5 py-2.5 text-sm font-medium transition ${active === x.id ? "bg-fg text-bg shadow-lg" : "text-muted hover:text-fg"}`}
          >{x.label}</button>
        ))}
      </div>
      <div id={`panel-${m.id}`} role="tabpanel" aria-labelledby={`tab-${m.id}`} className="grid items-center gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <h3 className="text-2xl font-bold tracking-tight md:text-3xl">{m.title}</h3>
          <p className="mt-3 text-base leading-relaxed text-muted">{m.text}</p>
          <ul className="mt-6 space-y-3">
            {m.points.map((p) => (
              <li key={p} className="flex gap-3 text-sm leading-relaxed"><span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#ffe168]" /><span>{p}</span></li>
            ))}
          </ul>
        </div>
        <BrowserFrame src={m.image} alt={m.alt} />
      </div>
    </div>
  );
}
