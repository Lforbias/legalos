import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { relativeTime } from "@/lib/dates/format";
import { boxV2Enabled } from "@/lib/features";
import { getBoxCases } from "@/server/judicial/box-cases.service";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Processos do Box" };

export default async function BoxCasesPage() {
  const { ctx } = await requireTenant();
  if (!boxV2Enabled(ctx.organizationId)) notFound();
  if (!can(ctx, "inbox:read")) return <AccessDenied />;
  const { cases, pending, pendingTotal } = await getBoxCases(ctx);

  return (
    <div className="mx-auto max-w-6xl space-y-6" data-testid="box-cases">
      <PageHeader title="Processos" description="Processos que já apareceram em comunicações do Box. O LegalOS só vincula sozinho quando o número do processo corresponde a um único processo cadastrado; nos demais casos, pede a sua confirmação." />

      {pendingTotal > 0 ? (
        <Card className="border-warning/40" data-testid="pending-matches">
          <CardHeader title={`Precisam de confirmação (${pendingTotal})`} description="Não foi criado nenhum processo novo: o LegalOS prefere perguntar a duplicar ou vincular ao processo errado." />
          <ul className="divide-y divide-border">
            {pending.map((p) => (
              <li key={p.noticeId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{p.caseNumber ? `Processo ${p.caseNumber}` : "Sem número de processo"}{p.courtCode ? ` · ${p.courtCode}` : ""} · {relativeTime(p.capturedAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="warning">{p.state === "AMBIGUOUS" ? "Mais de um processo com este número" : "Processo não cadastrado"}</Badge>
                  <Link href={`/caixa-de-entrada/${p.noticeId}`} className="text-xs text-primary-text hover:underline">Resolver</Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Processos com comunicações" description="Em ordem da comunicação mais recente." />
        {cases.length === 0 ? (
          <CardBody>
            <p className="text-sm text-muted" data-testid="no-box-cases">Nenhuma comunicação foi vinculada a um processo ainda. Quando uma publicação trouxer o número de um processo cadastrado, ele aparece aqui.</p>
          </CardBody>
        ) : (
          <ul className="divide-y divide-border" data-testid="box-case-list">
            {cases.map((c) => (
              <li key={c.caseId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <Link href={`/processos/${c.caseId}`} className="block truncate text-sm font-medium hover:underline">{c.title}</Link>
                  <p className="mt-0.5 text-xs text-muted">{c.number ?? "Sem número"}{c.court ? ` · ${c.court}` : ""} · última comunicação {relativeTime(c.lastAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{c.communications} comunicação(ões)</Badge>
                  {c.notViewed ? <Badge tone="info">{c.notViewed} não vista(s)</Badge> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
