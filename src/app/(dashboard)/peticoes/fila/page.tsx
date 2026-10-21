import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { TabsNav } from "@/components/ui/tabs-nav";
import { formatDateTime } from "@/lib/dates/format";
import { ScheduleSwitch } from "@/modules/petitions/schedule-card";
import { PETITION_STATUS_LABEL, PETITION_STATUS_TONE, type PetitionStatusKey } from "@/modules/petitions/schemas";
import { can } from "@/server/context";
import { getScheduleSwitch, listQueue } from "@/server/services/petition-queue.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Fila de protocolos" };

const VIEWS = ["fila", "agendadas", "protocoladas", "falhas"] as const;

export default async function QueuePage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { ctx, organization } = await requireTenant();
  if (!can(ctx, "petitions:read")) return <AccessDenied />;
  const sp = await searchParams;
  const view = (VIEWS as readonly string[]).includes(sp.aba ?? "") ? (sp.aba as (typeof VIEWS)[number]) : "fila";
  const [q, on] = await Promise.all([listQueue(ctx, { view }), getScheduleSwitch(ctx)]);
  const tz = organization.timezone;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Fila de protocolos" description="Petições aprovadas aguardando envio, agendadas, protocoladas (com recibo) e com falha." actions={<Link href="/peticoes" className="text-sm text-muted hover:underline">← Todas as petições</Link>} />
      <div className="mb-4"><ScheduleSwitch on={on} canManage={can(ctx, "organization:manage")} /></div>
      <TabsNav base="/peticoes/fila" current={view} tabs={[{ key: "fila", label: "Na fila", count: q.counts.queued }, { key: "agendadas", label: "Agendadas", count: q.counts.scheduled }, { key: "protocoladas", label: "Protocoladas", count: q.counts.submitted }, { key: "falhas", label: "Com falha", count: q.counts.failed }]} />
      {q.items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted" data-testid="queue-empty">Nada aqui.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Fila de protocolos</caption>
            <thead><tr className="border-b border-border text-left text-xs text-muted"><th className="px-4 py-2 font-medium">Petição</th><th className="px-3 py-2 font-medium">Processo</th><th className="px-3 py-2 font-medium">Situação</th><th className="px-3 py-2 font-medium">Quando</th><th className="px-3 py-2 font-medium">Recibo</th></tr></thead>
            <tbody>
              {q.items.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0" data-testid="queue-row">
                  <td className="px-4 py-2"><Link href={`/peticoes/${p.id}`} className="font-medium text-primary-text hover:underline">{p.title}</Link>{p.error ? <p className="max-w-xs text-xs text-danger">{p.error}</p> : null}{p.scheduleNote ? <p className="max-w-xs text-xs text-warning">Agendamento não executado: {p.scheduleNote}</p> : null}</td>
                  <td className="px-3 py-2"><Link href={`/processos/${p.case.id}`} className="hover:underline">{p.case.title}</Link>{p.case.court ? <p className="text-xs text-muted">{p.case.court}</p> : null}</td>
                  <td className="px-3 py-2"><Badge tone={PETITION_STATUS_TONE[p.status as PetitionStatusKey]}>{PETITION_STATUS_LABEL[p.status as PetitionStatusKey]}</Badge>{p.scheduledFor ? <Badge tone="info" className="ml-1">Agendada</Badge> : null}{p.isDemo && p.status === "SUBMITTED" ? <Badge tone="warning" className="ml-1">demonstração</Badge> : null}</td>
                  <td className="px-3 py-2 text-xs text-muted">{p.scheduledFor ? formatDateTime(p.scheduledFor, tz) : p.submittedAt ? formatDateTime(p.submittedAt, tz) : formatDateTime(p.updatedAt, tz)}</td>
                  <td className="px-3 py-2 text-xs">{p.hasReceipt ? <a className="text-primary-text hover:underline" href={`/api/petitions/${p.id}/receipt`}>Baixar recibo</a> : <span className="text-muted">—</span>}{p.protocol ? <p className="text-muted">{p.protocol}</p> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
