import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates/format";
import { dateToYmd, formatYmd } from "@/lib/dates/ymd";
import { NotFoundError } from "@/lib/permissions/check";
import { uuidSchema } from "@/lib/validation/common";
import { DeadlineControls } from "@/modules/deadlines/deadline-controls";
import { COUNT_TYPE_LABEL, DEADLINE_STATUS_LABEL } from "@/modules/deadlines/schemas";
import { deadlineDue, DUE_BADGE, dueText, STATUS_TONE } from "@/modules/deadlines/tone";
import { can } from "@/server/context";
import { getDeadline } from "@/server/services/deadline.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Prazo" };

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{children || <span className="text-muted">—</span>}</dd>
    </div>
  );
}

export default async function DeadlineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx, organization } = await requireTenant();
  if (!can(ctx, "deadlines:read")) return <AccessDenied />;
  const parsed = uuidSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const d = await getDeadline(ctx, parsed.data).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!d) notFound();
  const tz = organization.timezone;
  const due = dateToYmd(d.dueDate);
  const st = deadlineDue(due, d.status, tz);
  const canWrite = can(ctx, "deadlines:write");
  const editable = canWrite && (d.status === "DRAFT" || d.status === "VALIDATED");

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={d.title}
        description={d.kind ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={STATUS_TONE[d.status]}>{DEADLINE_STATUS_LABEL[d.status]}</Badge>
            {editable ? (
              <Link href={`/prazos/${d.id}/editar`} className={buttonVariants({ variant: "secondary" })}>
                <Pencil className="h-4 w-4" aria-hidden /> Editar
              </Link>
            ) : null}
          </div>
        }
      />
      {d.status === "DRAFT" ? (
        <div className="mb-4">
          <Alert tone="warning">Este prazo ainda <strong>não foi validado</strong>. Confira a data fatal, a contagem e as regras aplicáveis antes de validar.</Alert>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Dados do prazo" />
          <CardBody>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Item label="Data fatal">
                <Badge tone={DUE_BADGE[st.state]}>{formatYmd(due)}</Badge> {dueText(st.state, st.days) ? <span className="ml-1 text-xs text-muted">{dueText(st.state, st.days)}</span> : null}
              </Item>
              <Item label="Prazo interno">{d.internalDueDate ? formatYmd(dateToYmd(d.internalDueDate)) : null}</Item>
              <Item label="Processo"><Link className="hover:underline" href={`/processos/${d.case.id}`}>{d.case.title}</Link></Item>
              <Item label="Responsável">{d.responsibleName}</Item>
              <Item label="Início da contagem">{d.startDate ? formatYmd(dateToYmd(d.startDate)) : null}</Item>
              <Item label="Contagem">{d.days && d.countType ? `${d.days} ${COUNT_TYPE_LABEL[d.countType].toLowerCase()}` : null}</Item>
              <div className="sm:col-span-2"><Item label="Memória do cálculo">{d.calculationNote ? <span className="whitespace-pre-wrap">{d.calculationNote}</span> : null}</Item></div>
              <div className="sm:col-span-2"><Item label="Observações">{d.notes ? <span className="whitespace-pre-wrap">{d.notes}</span> : null}</Item></div>
            </dl>
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Ações" />
            <CardBody>
              <DeadlineControls id={d.id} status={d.status} canWrite={canWrite} canValidate={can(ctx, "deadlines:validate")} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Histórico" />
            <CardBody className="space-y-1 text-xs text-muted">
              <p>Cadastrado{d.createdByName ? ` por ${d.createdByName}` : ""} em {formatDateTime(d.createdAt, tz)}</p>
              {d.validatedAt ? <p>Validado{d.validatedByName ? ` por ${d.validatedByName}` : ""} em {formatDateTime(d.validatedAt, tz)}</p> : null}
              {d.fulfilledAt ? <p>Cumprido em {formatDateTime(d.fulfilledAt, tz)}</p> : null}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
