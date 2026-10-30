import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates/format";
import { boxV3PreviewEnabled } from "@/lib/box-v3-preview";
import { requireTenant } from "@/server/session";
import { getBoxV3PetitionQueue } from "@/server/judicial/box-v3.service";
import { BoxV3SectionNav } from "@/modules/box-v3/section-nav";

export const metadata: Metadata = { title: "Fila de protocolos · LegalOS Box 3.0" };
const statusLabel: Record<string, string> = { DRAFT: "Rascunho", IN_REVIEW: "Em revisão", APPROVED: "Aprovada", SUBMITTING: "Envio iniciado", SUBMITTED: "Enviada", FILED_CONFIRMED: "Protocolo confirmado", AWAITING_CONFIRMATION: "Aguardando confirmação", UNKNOWN: "Estado incerto", FAILED: "Falha", CANCELED: "Cancelada" };

export default async function BoxV3PetitionQueuePage() {
  if (!boxV3PreviewEnabled()) notFound();
  const { ctx } = await requireTenant();
  if (!ctx.permissions.has("petitions:read")) return <p className="text-sm text-muted">Você não tem acesso à fila de peticionamento deste escritório.</p>;
  const queue = await getBoxV3PetitionQueue(ctx);
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Fila de protocolos" description="Rascunhos, revisões, tentativas e recibos preservados no escritório." actions={ctx.permissions.has("petitions:write") ? <Link href="/box-v3/peticionamento/novo" className={buttonVariants({ variant: "primary" })}>Novo rascunho</Link> : undefined} />
      <BoxV3SectionNav permissions={ctx.permissions} current="/box-v3/peticionamento" />
      <Alert tone="warning">É possível criar, editar, revisar e aprovar internamente. Cancelar, agendar, enviar ou repetir protocolos segue indisponível. Um estado incerto exige conferência antes de qualquer novo envio.</Alert>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">{Object.entries(queue.counts).map(([status, count]) => <Card key={status}><CardBody><p className="text-xs text-muted">{statusLabel[status] ?? status}</p><p className="mt-1 text-2xl font-semibold">{count}</p></CardBody></Card>)}</div>
      {!queue.items.length ? <Card><CardBody className="py-10 text-center text-sm text-muted">Nenhuma petição registrada.</CardBody></Card> : <div className="space-y-2">{queue.items.map((item) => <Card key={item.id}><CardBody className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
        <div><div className="flex flex-wrap items-center gap-2"><h2 className="break-words text-sm font-semibold"><Link href={`/box-v3/peticionamento/${item.id}`} className="hover:text-primary-text">{item.title}</Link></h2><Badge tone={item.status === "FILED_CONFIRMED" || item.status === "SUBMITTED" ? "success" : item.status === "FAILED" || item.status === "UNKNOWN" ? "warning" : "neutral"}>{statusLabel[item.status] ?? item.status}</Badge>{item.isDemo ? <Badge tone="info">Demonstração</Badge> : null}</div><p className="mt-2 text-sm text-muted">{item.case.title} · {item.case.number ?? "Sem número"}</p><p className="mt-1 text-xs text-muted">{item.filingEnvironment ?? "Ambiente não registrado"}{item.protocol ? ` · protocolo ${item.protocol}` : ""}{item.hasReceipt ? " · recibo armazenado" : ""}{item.hasError ? " · há uma anotação de erro" : ""}</p></div>
        <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-1"><div><dt className="text-muted">Atualizada</dt><dd className="mt-0.5">{formatDateTime(item.updatedAt, ctx.timezone)}</dd></div><div><dt className="text-muted">Agendada</dt><dd className="mt-0.5">{item.scheduledFor ? formatDateTime(item.scheduledFor, ctx.timezone) : "Não"}</dd></div><div><dt className="text-muted">Último marco</dt><dd className="mt-0.5">{item.confirmedAt ? `Confirmação · ${formatDateTime(item.confirmedAt, ctx.timezone)}` : item.unknownSince ? `Incerto · ${formatDateTime(item.unknownSince, ctx.timezone)}` : item.submittedAt ? `Envio · ${formatDateTime(item.submittedAt, ctx.timezone)}` : "Sem envio registrado"}</dd></div></dl>
      </CardBody></Card>)}</div>}
    </div>
  );
}
