import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PROTOTYPES } from "@/modules/prototypes/registry";

export const metadata: Metadata = { title: "Protótipos" };

const VERSIONS = [["2.0", "Versão 2.0 — lacunas em relação ao Astrea"], ["3.0", "Versão 3.0 — lacunas em relação ao LegalMail"], ["4.0", "Versão 4.0 — lacunas em relação ao ChatGuru"]] as const;

export default function PrototypesIndex() {
  return (
    <div>
      <PageHeader title="Protótipos das próximas versões" description="Telas só visuais para validar o desenho antes de construir. As fases continuam “a fazer” até o funcionamento real existir." />
      <div className="space-y-4">
        {VERSIONS.map(([v, title]) => (
          <Card key={v}>
            <CardHeader title={title} />
            <CardBody>
              <ul className="grid gap-2 md:grid-cols-2">
                {PROTOTYPES.filter((p) => p.version === v).map((p) => (
                  <li key={p.id} className="rounded-md border border-border p-3">
                    <Link href={`/prototipos/${p.id}`} className="text-sm font-medium hover:underline">{p.id} — {p.title}</Link>
                    <p className="mt-1 text-xs text-muted">{p.summary}</p>
                    <div className="mt-1.5"><Badge>{p.space}</Badge></div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
