import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid, Plus, Rows3, Search } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { ExportLinks } from "@/modules/export/export-links";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { dateToYmd, formatYmd } from "@/lib/dates/ymd";
import { cn } from "@/lib/utils";
import { TASK_PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL } from "@/modules/tasks/schemas";
import { TaskStatusSelect } from "@/modules/tasks/task-controls";
import { dueState, PRIORITY_TONE } from "@/modules/tasks/tone";
import { can } from "@/server/context";
import { listActiveMembers } from "@/server/services/members";
import { listTaskStages } from "@/server/services/task-stage.service";
import { listTasks } from "@/server/services/task.service";
import { listTaskLabels, listTaskTypes, pointsReport } from "@/server/services/task-extras.service";
import { LabelBadge } from "@/modules/tasks/extras-ui";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Tarefas" };

type SP = { etapa?: string; etiqueta?: string; tipo?: string; q?: string; status?: string; responsavel?: string; atrasadas?: string; visao?: string };
const BOARD_COLUMNS = ["TODO", "IN_PROGRESS", "WAITING", "DONE"] as const;

const DUE_TONE = { overdue: "danger", today: "warning", soon: "warning", ok: "neutral", none: "neutral" } as const;
const DUE_LABEL = { overdue: "Atrasada", today: "Vence hoje", soon: "Vence em breve", ok: "", none: "" } as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "tasks:read")) return <AccessDenied />;
  const sp = await searchParams;
  const board = sp.visao === "quadro";
  const status = (TASK_STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof TASK_STATUSES)[number]) : undefined;
  const assigneeId = sp.responsavel === "eu" ? ctx.userId : /^[0-9a-f-]{36}$/i.test(sp.responsavel ?? "") ? sp.responsavel : undefined;
  const overdue = sp.atrasadas === "1";
  const uuid = (v?: string) => (/^[0-9a-f-]{36}$/i.test(v ?? "") ? v : undefined);
  const labelId = uuid(sp.etiqueta);
  const typeId = uuid(sp.tipo);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const [result, members, labels, types, points, stages] = await Promise.all([
    listTasks(ctx, { stageId: uuid(sp.etapa), q: sp.q, status, assigneeId, labelId, typeId, overdue, includeClosed: board || Boolean(status) }),
    listActiveMembers(ctx),
    listTaskLabels(ctx),
    listTaskTypes(ctx),
    pointsReport(ctx, monthStart, monthEnd), listTaskStages(ctx),
  ]);
  const canWrite = can(ctx, "tasks:write");
  const filtered = Boolean(sp.etapa || sp.q || status || assigneeId || overdue || labelId || typeId);
  const viewHref = (v: "lista" | "quadro") => {
    const q = new URLSearchParams();
    for (const [k, val] of Object.entries({ q: sp.q, status, responsavel: sp.responsavel, etapa: sp.etapa, etiqueta: labelId, tipo: typeId, atrasadas: overdue ? "1" : undefined })) if (val) q.set(k, val);
    if (v === "quadro") q.set("visao", "quadro");
    const qs = q.toString();
    return qs ? `/tarefas?${qs}` : "/tarefas";
  };

  const card = (t: (typeof result.items)[number]) => {
    const due = t.dueDate ? dateToYmd(t.dueDate) : null;
    const open = t.status !== "DONE" && t.status !== "CANCELED";
    const ds = dueState(due, open, ctx.timezone);
    return (
      <article key={t.id} className="rounded-md border border-border bg-surface p-2.5">
        <Link href={`/tarefas/${t.id}`} className="block text-sm font-medium hover:underline">{t.title}</Link>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge tone={PRIORITY_TONE[t.priority]}>{TASK_PRIORITY_LABEL[t.priority]}</Badge>
          {due ? <Badge tone={DUE_TONE[ds]}>{formatYmd(due)}{DUE_LABEL[ds] ? ` · ${DUE_LABEL[ds]}` : ""}</Badge> : null}
          {t.labels.map((l) => <LabelBadge key={l.label.id} name={l.label.name} color={l.label.color} />)}
        </div>
        <p className="mt-1 truncate text-xs text-muted">
          {t.assigneeName ?? "Sem responsável"}
          {t.case ? ` · ${t.case.title}` : ""}
        </p>
        {canWrite ? (
          <div className="mt-2">
            <TaskStatusSelect stages={stages} stageId={t.stageId} taskId={t.id} status={t.status} compact />
          </div>
        ) : null}
      </article>
    );
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Tarefas"
        description="Providências do escritório, com responsável, vencimento e vínculo opcional a processo e cliente."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ExportLinks kind="tarefas" />
            <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Modo de visualização">
              <Link href={viewHref("lista")} aria-current={!board ? "page" : undefined} className={cn("flex h-8 items-center gap-1.5 rounded px-2.5 text-xs", !board ? "bg-surface-3 font-medium" : "text-muted hover:text-fg")}>
                <Rows3 className="h-3.5 w-3.5" aria-hidden /> Lista
              </Link>
              <Link href={viewHref("quadro")} aria-current={board ? "page" : undefined} className={cn("flex h-8 items-center gap-1.5 rounded px-2.5 text-xs", board ? "bg-surface-3 font-medium" : "text-muted hover:text-fg")}>
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden /> Quadro
              </Link>
            </div>
            {canWrite ? (
              <Link href="/tarefas/nova" className={buttonVariants({})}>
                <Plus className="h-4 w-4" aria-hidden /> Nova tarefa
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="mb-3 flex gap-3 text-sm">{can(ctx, "organization:manage") ? <Link className="underline" href="/tarefas/etapas">Personalizar etapas</Link> : null}</div>
      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="search" aria-label="Filtrar tarefas">
        {board ? <input type="hidden" name="visao" value="quadro" /> : null}
        <label className="text-sm">Etapa<Select name="etapa" defaultValue={sp.etapa ?? ""}><option value="">Todas as etapas</option>{stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></label>
        <div className="relative">
          <label htmlFor="q" className="sr-only">Buscar tarefas</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Título ou descrição" className="pl-9" />
        </div>
        <div>
          <label htmlFor="status" className="sr-only">Situação</label>
          <Select id="status" name="status" defaultValue={status ?? ""}>
            <option value="">{board ? "Todas as situações" : "Em aberto"}</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="responsavel" className="sr-only">Responsável</label>
          <Select id="responsavel" name="responsavel" defaultValue={sp.responsavel ?? ""}>
            <option value="">Todos os responsáveis</option>
            <option value="eu">Minhas tarefas</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="etiqueta" className="sr-only">Etiqueta</label>
          <Select id="etiqueta" name="etiqueta" defaultValue={labelId ?? ""}>
            <option value="">Todas as etiquetas</option>
            {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        </div>
        <div>
          <label htmlFor="tipo" className="sr-only">Tipo</label>
          <Select id="tipo" name="tipo" defaultValue={typeId ?? ""}>
            <option value="">Todos os tipos</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </div>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" name="atrasadas" value="1" defaultChecked={overdue} className="h-4 w-4" /> Só atrasadas
        </label>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>Filtrar</button>
      </form>

      {points.length ? (
        <details className="mb-3 rounded-md border border-border bg-surface px-3 py-2 text-sm" data-testid="points-report">
          <summary className="cursor-pointer font-medium">Pontuação do mês (tarefas concluídas com tipo)</summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {points.map((p) => (
              <li key={p.userId ?? "none"} className="flex items-center justify-between rounded bg-surface-2/60 px-2 py-1">
                <span>{p.name}</span><span className="text-xs text-muted">{p.points} pt · {p.tasks} tarefa(s)</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {result.truncated ? <p className="mb-2 text-xs text-warning">Mostrando as 300 primeiras de {result.total} tarefas. Use os filtros para refinar.</p> : null}

      {result.items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">
          {filtered ? "Nenhuma tarefa encontrada com esses filtros." : "Nenhuma tarefa cadastrada ainda."}
          {canWrite && !filtered ? (
            <div className="mt-3">
              <Link href="/tarefas/nova" className={buttonVariants({ variant: "secondary" })}>Criar a primeira tarefa</Link>
            </div>
          ) : null}
        </Card>
      ) : board ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {BOARD_COLUMNS.map((s) => {
            const col = result.items.filter((t) => t.status === s);
            return (
              <section key={s} aria-label={TASK_STATUS_LABEL[s]} className="rounded-lg border border-border bg-surface-2/40 p-2">
                <h2 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold">
                  {TASK_STATUS_LABEL[s]} <span className="rounded-full bg-surface-3 px-1.5 text-[11px] text-muted">{col.length}</span>
                </h2>
                <div className="space-y-2">{col.map(card)}</div>
              </section>
            );
          })}
        </div>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Lista de tarefas</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th scope="col" className="px-4 py-2 font-medium">Tarefa</th>
                <th scope="col" className="px-3 py-2 font-medium">Vencimento</th>
                <th scope="col" className="px-3 py-2 font-medium">Prioridade</th>
                <th scope="col" className="px-3 py-2 font-medium">Responsável</th>
                <th scope="col" className="px-3 py-2 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((t) => {
                const due = t.dueDate ? dateToYmd(t.dueDate) : null;
                const ds = dueState(due, t.status !== "DONE" && t.status !== "CANCELED", ctx.timezone);
                return (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      <Link href={`/tarefas/${t.id}`} className="font-medium hover:underline">{t.title}</Link>
                      {t.case ? <p className="text-xs text-muted">{t.case.title}</p> : null}
                      {t.type || t.labels.length ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {t.type ? <Badge tone="info">{t.type.name} · {t.type.points} pt</Badge> : null}
                          {t.labels.map((l) => <LabelBadge key={l.label.id} name={l.label.name} color={l.label.color} />)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      {due ? <Badge tone={DUE_TONE[ds]}>{formatYmd(due)}{DUE_LABEL[ds] ? ` · ${DUE_LABEL[ds]}` : ""}</Badge> : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-3 py-2.5"><Badge tone={PRIORITY_TONE[t.priority]}>{TASK_PRIORITY_LABEL[t.priority]}</Badge></td>
                    <td className="px-3 py-2.5 text-muted">{t.assigneeName ?? "—"}</td>
                    <td className="px-3 py-2.5 text-xs">{t.stage?.name ?? TASK_STATUS_LABEL[t.status]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
