import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { FOUNDERS } from "@/config/founders";

export function FounderCards() {
  return <div className="grid gap-8 md:grid-cols-3" data-testid="founder-cards">
    {FOUNDERS.map(person => <article key={person.slug}>
      <Link href={`/produto/fundadores/${person.slug}`} aria-label={`Conhecer ${person.name}`} className="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-primary">
        <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-white">
          <Image src={person.image} alt={person.name} fill sizes="(max-width: 767px) 100vw, (max-width: 1280px) 33vw, 405px" className="object-cover transition-transform duration-500 group-hover:scale-[1.025] motion-reduce:transform-none" style={{ objectPosition: person.position }} />
        </div>
        <div className="mt-6 flex items-start justify-between gap-5 border-t border-border pt-5">
          <div><p className="text-xs tracking-wide text-muted">{person.role}</p><h2 className="mt-2 max-w-xs text-xl font-medium leading-snug tracking-tight">{person.name}</h2></div>
          <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-muted transition group-hover:text-fg" aria-hidden />
        </div>
      </Link>
    </article>)}
  </div>;
}
