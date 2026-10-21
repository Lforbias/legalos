import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/dates/format";
import { dateToYmd, formatYmd } from "@/lib/dates/ymd";
import { NotFoundError } from "@/lib/permissions/check";
import { uuidSchema } from "@/lib/validation/common";
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/modules/tasks/schemas";
import { DeleteTaskButton } from "@/modules/tasks/delete-task-button";
import { CommentForm, TaskStatusSelect } from "@/modules/tasks/task-controls";
import { dueState, PRIORITY_TONE } from "@/modules/tasks/tone";
import { can } from "@/server/context";
import { getTask } from "@/server/services/task.service";
import { getTaskClassification, listTaskAttachments, listTaskEvents, listTaskLabels, listTaskTypes } from "@/server/services/task-extras.service";
import { listActiveMembers } from "@/server/services/members";
import { AttachmentsCard, ClassificationCard, LabelBadge } from "@/modules/tasks/extras-ui";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Tarefa" };

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx, organization } = await requireTenant();
  if (!can(ctx, "tasks:read")) return <AccessDenied />;
  const parsed = uuidSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const t = await getTask(ctx, parsed.data).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!t) notFound();
  const canWrite = can(ctx, "tasks:write");
  const [cls, types, labels, attachments, events, members] = await Promise.all([
    getTaskClassification(ctx, t.id), listTaskTypes(ctx, { onlyActive: true }), listTaskLabels(ctx), listTaskAttachments(ctx, t.id), listTaskEvents(ctx, t.id), listActiveMembers(ctx),
  ]);
  const tz = organization.timezone;
  const due = t.dueDate ? dateToYmd(t.dueDate) : null;
  const ds = dueState(due, t.status !== "DONE" && t.status !== "CANCELED", tz);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={t.title}
        description={`Criada${t.createdByName ? ` por ${t.createdByName}` : ""} em ${formatDate(t.createdAt, tz)}`}
        actions={
          canWrite ? (
            <Link href={`/tarefas/${t.id}/editar`} className={buttonVariants({ variant: "secondary" })}>
              <Pencil className="h-4 w-4" aria-hidden /> Editar
            </Link>
          ) : null
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Descrição" />
            <CardBody className="whitespace-pre-wrap text-sm">{t.description ?? <span className="text-muted">Sem descrição.</span>}</CardBody>
          </Card>
          <Card>
            <CardHeader title={`Comentários (${t.comments.length})`} />
            <CardBody className="space-y-4">
              {t.comments.length === 0 ? <p className="text-sm text-muted">Nenhum comentário ainda.</p> : null}
              {t.comments.map((c) => (
                <div key={c.id}>
                  <p className="text-xs text-muted">{c.authorName} · {formatDateTime(c.createdAt, tz)}</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm">{c.body}</p>
                </div>
              ))}
              {canWrite ? <CommentForm taskId={t.id} members={members} /> : null}
            </CardBody>
          </Card>
          <AttachmentsCard taskId={t.id} canWrite={canWrite} tz={tz} items={attachments.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }))} />
          <Card>
            <CardHeader title={`Histórico (${events.length})`} />
            <CardBody>
              <ol className="space-y-2 text-sm" data-testid="task-history">
                {events.map((e) => (
                  <li key={e.id}>
                    <span className="text-xs text-muted">{formatDateTime(e.createdAt, tz)} · {e.userName}</span>
                    <br />{e.detail}
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Situação" />
            <CardBody className="space-y-3">
              <TaskStatusSelect taskId={t.id} status={t.status} disabled={!canWrite} />
              <div className="flex flex-wrap gap-1.5">
                <Badge tone={PRIORITY_TONE[t.priority]}>{TASK_PRIORITY_LABEL[t.priority]}</Badge>
                {due ? <Badge tone={ds === "overdue" ? "danger" : ds === "today" || ds === "soon" ? "warning" : "neutral"}>{formatYmd(due)}{ds === "overdue" ? " · Atrasada" : ""}</Badge> : null}
                <Badge>{TASK_STATUS_LABEL[t.status]}</Badge>
              </div>
              {cls.type ? <p className="text-xs text-muted">Tipo: {cls.type.name} ({cls.type.points} pt)</p> : null}
              {cls.labels.length ? <div className="flex flex-wrap gap-1.5">{cls.labels.map((l) => <LabelBadge key={l.id} name={l.name} color={l.color} />)}</div> : null}
              {t.completedAt ? <p className="text-xs text-muted">Concluída em {formatDateTime(t.completedAt, tz)}</p> : null}
            </CardBody>
          </Card>
          <ClassificationCard taskId={t.id} canWrite={canWrite} types={types.map((x) => ({ id: x.id, name: x.name, points: x.points }))} labels={labels.map((l) => ({ id: l.id, name: l.name, color: l.color }))} typeId={cls.type?.id ?? ""} labelIds={cls.labels.map((l) => l.id)} />
          <Card>
            <CardHeader title="Vínculos" />
            <CardBody className="space-y-2 text-sm">
              <p><span className="text-xs text-muted">Responsável</span><br />{t.assigneeName ?? "—"}</p>
              <p>
                <span className="text-xs text-muted">Processo</span><br />
                {t.case ? <Link className="hover:underline" href={`/processos/${t.case.id}`}>{t.case.title}</Link> : "—"}
              </p>
              <p>
                <span className="text-xs text-muted">Cliente</span><br />
                {t.client ? <Link className="hover:underline" href={`/clientes/${t.client.id}`}>{t.client.name}</Link> : "—"}
              </p>
            </CardBody>
          </Card>
          {canWrite ? <DeleteTaskButton taskId={t.id} /> : null}
        </div>
      </div>
    </div>
  );
}
