import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { formatYmd, dateToYmd } from "@/lib/dates/ymd";
import { cn } from "@/lib/utils";
import { NOTICE_KIND_LABEL, NOTICE_STATUSES, NOTICE_STATUS_LABEL } from "@/modules/inbox/schemas";
import { can } from "@/server/context";
import { listActiveMembers } from "@/server/services/members";
import { listNotices, noticeBoxCounts, NOTICE_BOXES, type NoticeBox } from "@/server/services/notice.service";
import { listNoticeTags, listTeams } from "@/server/services/inbox-flow.service";
import { monitorProblems, noticeDayCounts } from "@/server/services/notice-desk.service";
import { Alert } from "@/components/ui/alert";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Caixa de entrada jurídica" };

type SP = { q?: string; status?: string; responsavel?: string; duplicadas?: string; caixa?: string; etiqueta?: string };
const REASON = { FALHOU: "a última verificação falhou", NUNCA_VERIFICADO: "ainda não foi verificado", SEM_VERIFICAR: "está há mais de 36 horas sem verificar" } as const;
const TONE = { NEW: "warning", DISTRIBUTED: "info", PROCESSED: "success", DISCARDED: "neutral" } as const;

export default async function InboxPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "inbox:read")) return <AccessDenied />;
  const sp = await searchParams;
  const status = (NOTICE_STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof NOTICE_STATUSES)[number]) : undefined;
  const assigneeId = sp.responsavel === "eu" ? ctx.userId : /^[0-9a-f-]{36}$/i.test(sp.responsavel ?? "") ? sp.responsavel : undefined;
  const [boxRaw, boxTeam] = (sp.caixa ?? "").split(":");
  const box = (NOTICE_BOXES as readonly string[]).includes(boxRaw ?? "") ? (boxRaw as NoticeBox) : undefined;
  const teamId = box === "equipe" && /^[0-9a-f-]{36}$/i.test(boxTeam ?? "") ? boxTeam : undefined;
  const tag = sp.etiqueta?.slice(0, 30);
  const [result, counts, members, teams, tags, day, problems] = await Promise.all([
    listNotices(ctx, { q: sp.q, status: box ? undefined : status, assigneeId, duplicates: sp.duplicadas === "1", box: box === "equipe" && !teamId ? undefined : box, teamId, tag }),
    noticeBoxCounts(ctx),
    listActiveMembers(ctx),
    listTeams(ctx),
    listNoticeTags(ctx),
    noticeDayCounts(ctx),
    monitorProblems(ctx),
  ]);
  const teamNames = new Map(teams.map((t) => [t.id, t.name]));
  const canWrite = can(ctx, "inbox:write");
  const current = box ? (box === "equipe" && teamId ? `equipe:${teamId}` : box) : "";
  const tabs: { key: string; label: string; count: number }[] = [
    { key: "", label: "Em aberto", count: counts.entrada + counts.geral },
    { key: "entrada", label: "Entrada", count: counts.entrada },
    { key: "minhas", label: "Minhas", count: counts.minhas },
    { key: "geral", label: "Geral", count: counts.geral },
    ...teams.map((t) => ({ key: `equipe:${t.id}`, label: t.name, count: counts.teams[t.id] ?? 0 })),
    { key: "acervo", label: "Acervo", count: counts.acervo },
    { key: "adormecidas", label: "Adormecidas", count: counts.adormecidas },
    { key: "descartadas", label: "Descartadas", count: counts.descartadas },
  ];
  const href = (key: string) => (key ? `/caixa-de-entrada?caixa=${key}` : "/caixa-de-entrada");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Caixa de entrada jurídica"
        description="Central de intimações e publicações: registre, classifique, distribua e transforme em tarefas e prazos. Registre à mão, cole o texto ou importe do DJEN e do PJe em Integrações. Caixas: Entrada (sem responsável), Minhas, Geral, equipes, Acervo (tratadas) e Adormecidas."
        actions={
          <div className="flex gap-2">
            {can(ctx, "members:manage") ? <Link href="/caixa-de-entrada/equipes" className={buttonVariants({ variant: "secondary" })}>Equipes</Link> : null}
            {canWrite ? (
              <Link href="/caixa-de-entrada/nova" className={buttonVariants({})}>
                <Plus className="h-4 w-4" aria-hidden /> Nova intimação
              </Link>
            ) : null}
          </div>
        }
      />
      {problems.length > 0 ? (
        <div className="mb-4" data-testid="inbox-monitor-alert">
          <Alert tone="warning">
            <strong>Atenção: {problems.length === 1 ? "1 nome monitorado não está" : `${problems.length} nomes monitorados não estão`} sendo capturado{problems.length === 1 ? "" : "s"}.</strong>{" "}
            {problems.map((p) => `${p.label} (${p.oab}) — ${REASON[p.reason]}`).join("; ")}. Publicações novas desses nomes podem não ter chegado.{" "}
            {can(ctx, "integrations:manage") ? <Link className="underline" href="/integracoes">Verificar em Integrações</Link> : "Avise quem administra as integrações."}
          </Alert>
        </div>
      ) : null}
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4" data-testid="inbox-day-counts" role="group" aria-label="Resumo do dia">
        {[
          { k: "openReceivedToday", label: "Não tratadas de hoje", v: day.openReceivedToday },
          { k: "openTotal", label: "Não tratadas (todas)", v: day.openTotal },
          { k: "processedToday", label: "Tratadas hoje", v: day.processedToday },
          { k: "discardedToday", label: "Descartadas hoje", v: day.discardedToday },
        ].map((c) => (
          <Card key={c.k} className="px-4 py-3">
            <div className="text-2xl font-semibold tabular-nums" data-testid={`day-${c.k}`}>{c.v}</div>
            <div className="text-xs text-muted">{c.label}</div>
          </Card>
        ))}
      </div>
      <nav aria-label="Situação" className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => {
          const active = current === t.key && !(status && !box);
          return (
            <Link
              key={t.key || "open"}
              href={href(t.key)}
              aria-current={active ? "page" : undefined}
              className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm", active ? "border-primary font-medium" : "border-transparent text-muted hover:text-fg")}
            >
              {t.label} <span className="ml-1 rounded-full bg-surface-2 px-1.5 text-[11px] text-muted">{t.count}</span>
            </Link>
          );
        })}
      </nav>
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2" role="search" aria-label="Filtrar intimações">
        {status && !box ? <input type="hidden" name="status" value={status} /> : null}
        {box ? <input type="hidden" name="caixa" value={current} /> : null}
        <div className="relative min-w-60 flex-1">
          <label htmlFor="q" className="sr-only">Buscar</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Título, teor ou número do processo" className="pl-9" />
        </div>
        <div>
          <label htmlFor="responsavel" className="sr-only">Responsável</label>
          <Select id="responsavel" name="responsavel" defaultValue={sp.responsavel ?? ""} className="w-56">
            <option value="">Todos os responsáveis</option>
            <option value="eu">Distribuídas para mim</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </div>
        {tags.length ? (
          <div>
            <label htmlFor="etiqueta" className="sr-only">Etiqueta</label>
            <Select id="etiqueta" name="etiqueta" defaultValue={sp.etiqueta ?? ""} className="w-44">
              <option value="">Todas as etiquetas</option>
              {tags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </div>
        ) : null}
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" name="duplicadas" value="1" defaultChecked={sp.duplicadas === "1"} className="h-4 w-4" /> Possíveis duplicatas
        </label>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>Filtrar</button>
      </form>
      {result.truncated ? <p className="mb-2 text-xs text-warning">Mostrando as 200 mais recentes de {result.total}.</p> : null}
      {result.items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">Nenhuma intimação encontrada.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Intimações</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th scope="col" className="px-4 py-2 font-medium">Recebida</th>
                <th scope="col" className="px-3 py-2 font-medium">Intimação</th>
                <th scope="col" className="px-3 py-2 font-medium">Processo</th>
                <th scope="col" className="px-3 py-2 font-medium">Responsável</th>
                <th scope="col" className="px-3 py-2 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((n) => (
                <tr key={n.id} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{formatYmd(dateToYmd(n.receivedAt))}</td>
                  <td className="px-3 py-2.5">
                    <Link href={`/caixa-de-entrada/${n.id}`} className="font-medium hover:underline">{n.title}</Link>
                    <p className="text-xs text-muted">
                      {NOTICE_KIND_LABEL[n.kind]}{n.court ? ` · ${n.court}` : ""}
                      {n.duplicateOfId ? <Badge tone="warning" className="ml-2">Possível duplicata</Badge> : null}
                      {n.snoozedUntil ? <Badge tone="neutral" className="ml-2">Adormecida até {formatYmd(dateToYmd(n.snoozedUntil))}</Badge> : null}
                      {n.tags.map((t) => (
                        <Badge key={t} tone="info" className="ml-1">{t}</Badge>
                      ))}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">
                    {n.case ? <Link href={`/processos/${n.case.id}`} className="hover:underline">{n.case.title}</Link> : <span className="text-muted">{n.caseNumber ?? "Sem processo"}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-muted">{n.assigneeName ?? (n.teamId ? `Equipe ${teamNames.get(n.teamId) ?? ""}`.trim() : "—")}</td>
                  <td className="px-3 py-2.5"><Badge tone={TONE[n.status]}>{NOTICE_STATUS_LABEL[n.status]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
