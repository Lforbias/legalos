import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates/format";
import { NewSessionForm } from "@/modules/copiloto/copiloto-ui";
import { can } from "@/server/context";
import { listCaseOptions } from "@/server/services/case.service";
import { listClients } from "@/server/services/client.service";
import { listSessions } from "@/server/services/service-session.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Copiloto de atendimento" };
const LABEL = { DRAFT: "Sem análise", ANALYZED: "Para revisar", REVIEWED: "Revisado" } as const;

export default async function CopilotoPage() {
  const { ctx, organization } = await requireTenant();
  if (!can(ctx, "ai:use")) return <AccessDenied />;
  const [rows, cases, clients] = await Promise.all([
    listSessions(ctx),
    can(ctx, "cases:read") ? listCaseOptions(ctx) : [],
    can(ctx, "clients:read") ? listClients(ctx, {}).then((r) => (Array.isArray(r) ? r : ((r as { items?: { id: string; name: string }[] }).items ?? []))) : [],
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Copiloto de atendimento" description="Depois do atendimento: cole a transcrição e receba resumo, ações que podem caber, tarefas e documentos. Tudo em rascunho, revisado por uma pessoa." />
      <Card>
        <CardHeader title="Novo atendimento" />
        <CardBody><NewSessionForm cases={cases.map((c) => ({ id: c.id, label: `${c.title}${c.number ? ` (${c.number})` : ""}` }))} clients={(clients as { id: string; name: string }[]).slice(0, 200).map((c) => ({ id: c.id, label: c.name }))} /></CardBody>
      </Card>
      <Card>
        <CardHeader title="Meus atendimentos" />
        <ul className="divide-y divide-border">
          {rows.length === 0 ? <li className="p-6 text-center text-sm text-muted">Nenhum atendimento ainda.</li> : null}
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <Link href={`/copiloto/${r.id}`} className="font-medium hover:underline">{r.title}</Link>
              <span className="flex items-center gap-2 text-xs text-muted">{formatDateTime(r.createdAt, organization.timezone)} <Badge tone={r.status === "REVIEWED" ? "success" : r.status === "ANALYZED" ? "warning" : "neutral"}>{LABEL[r.status as keyof typeof LABEL] ?? r.status}</Badge></span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
