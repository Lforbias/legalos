import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { BlockView } from "@/modules/prototypes/blocks";
import { getPrototype } from "@/modules/prototypes/registry";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const p = getPrototype((await params).id);
  return { title: p ? `Protótipo ${p.id}` : "Protótipo" };
}

export default async function PrototypePage({ params }: { params: Promise<{ id: string }> }) {
  const p = getPrototype((await params).id);
  if (!p) notFound();
  return (
    <div>
      <p className="mb-2 text-xs"><Link href="/prototipos" className="text-muted hover:underline">← Todos os protótipos</Link></p>
      <PageHeader title={`${p.id} — ${p.title}`} description={p.summary} actions={<Badge>{p.space}</Badge>} />
      <div className="space-y-4">
        {p.blocks.map((b, i) => <BlockView key={i} b={b} idx={i} />)}
      </div>
    </div>
  );
}
