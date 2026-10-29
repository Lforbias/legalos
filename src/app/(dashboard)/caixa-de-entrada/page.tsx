import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { FilterPanel } from "@/components/layout/filter-panel";
import { SectionSelect } from "@/components/ui/section-select";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { NOTICE_KINDS, NOTICE_KIND_LABEL, NOTICE_STATUSES } from "@/modules/inbox/schemas";
import { NoticeReader } from "@/modules/inbox/notice-reader";
import { formatYmd, dateToYmd } from "@/lib/dates/ymd";
import { NoticeTable } from "@/modules/inbox/notice-table";
import { noticeListOptionsSchema, ORIGIN_LABEL } from "@/modules/inbox/list-schemas";
import { can } from "@/server/context";
import { listActiveMembers } from "@/server/services/members";
import { listNotices, noticeBoxCounts, NOTICE_BOXES, type NoticeBox } from "@/server/services/notice.service";
import { listNoticeTags, listTeams } from "@/server/services/inbox-flow.service";
import { monitorProblems, noticeDayCounts } from "@/server/services/notice-desk.service";
import { Alert } from "@/components/ui/alert";
import { requireTenant } from "@/server/session";
import { boxV2Enabled } from "@/lib/features";
import { COMMUNICATION_ORIGINS, ORIGIN_LABEL as COMMUNICATION_ORIGIN_LABEL } from "@/lib/judicial/contracts";
import { LiveRefresh } from "@/modules/box/live-refresh";
import { countUnviewed, listProfessionalOptions } from "@/server/judicial/inbox-v2.service";
import { latestBoxCursor } from "@/server/judicial/live";

export const metadata: Metadata = { title: "Caixa de entrada jurídica" };

type SP = { leitura?: string; selecionada?: string; q?: string; status?: string; responsavel?: string; duplicadas?: string; caixa?: string; etiqueta?: string; tipo?: string; origem?: string; orgao?: string; recebidaDe?: string; recebidaAte?: string; publicadaDe?: string; publicadaAte?: string; pagina?: string; porPagina?: string; ordem?: string; profissional?: string; fonte?: string; vista?: string };
const REASON = { FALHOU: "a última verificação falhou", NUNCA_VERIFICADO: "ainda não foi verificado", SEM_VERIFICAR: "está há mais de 36 horas sem verificar" } as const;

export default async function InboxPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "inbox:read")) return <AccessDenied />;
  const sp = await searchParams;
  const v2 = boxV2Enabled(ctx.organizationId);
  const parsed = noticeListOptionsSchema.safeParse({ kind: sp.tipo || undefined, origin: sp.origem || undefined, court: sp.orgao, receivedFrom: sp.recebidaDe || undefined, receivedTo: sp.recebidaAte || undefined, publishedFrom: sp.publicadaDe || undefined, publishedTo: sp.publicadaAte || undefined, page: sp.pagina || undefined, pageSize: sp.porPagina || undefined, sort: sp.ordem || undefined });
  if (!parsed.success) return <div className="space-y-3"><PageHeader title="Caixa de entrada jurídica" /><Alert tone="error">{parsed.error.issues[0]?.message}</Alert><Link href="/caixa-de-entrada" className="underline">Limpar filtros</Link></div>;
  const status = (NOTICE_STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof NOTICE_STATUSES)[number]) : undefined;
  const assigneeId = sp.responsavel === "eu" ? ctx.userId : /^[0-9a-f-]{36}$/i.test(sp.responsavel ?? "") ? sp.responsavel : undefined;
  const [boxRaw, boxTeam] = (sp.caixa ?? "").split(":");
  const box = (NOTICE_BOXES as readonly string[]).includes(boxRaw ?? "") ? (boxRaw as NoticeBox) : undefined;
  const teamId = box === "equipe" && /^[0-9a-f-]{36}$/i.test(boxTeam ?? "") ? boxTeam : undefined;
  const tag = sp.etiqueta?.slice(0, 30);
  // Box 2.0: filtros pelo que o LegalOS sabe da origem. Valores inválidos são ignorados (nunca viram consulta).
  const professionalId = v2 && /^[0-9a-f-]{36}$/i.test(sp.profissional ?? "") ? sp.profissional : undefined;
  const originKind = v2 && (COMMUNICATION_ORIGINS as readonly string[]).includes(sp.fonte ?? "") ? sp.fonte : undefined;
  const viewed = v2 ? (sp.vista === "nao" ? ("no" as const) : sp.vista === "sim" ? ("yes" as const) : undefined) : undefined;
  // A marca vem ANTES de ler os dados: o que entrar depois dela é avisado pelo canal ao vivo.
  const cursor = v2 ? await latestBoxCursor(ctx.organizationId) : undefined;
  const [result, counts, members, teams, tags, day, problems, professionals, unviewed] = await Promise.all([
    listNotices(ctx, { ...parsed.data, q: sp.q, status: box ? undefined : status, assigneeId, duplicates: sp.duplicadas === "1", box: box === "equipe" && !teamId ? undefined : box, teamId, tag, professionalId, originKind, viewed }),
    noticeBoxCounts(ctx),
    listActiveMembers(ctx),
    listTeams(ctx),
    listNoticeTags(ctx),
    noticeDayCounts(ctx),
    monitorProblems(ctx),
    v2 ? listProfessionalOptions(ctx) : Promise.resolve([]),
    v2 ? countUnviewed(ctx) : Promise.resolve(0),
  ]);
  const canWrite = can(ctx, "inbox:write");
  const reading = sp.leitura === "1";
  // O leitor só abre itens da página filtrada. IDs arbitrários não consultam outros processos.
  const selected = result.items.find(n => n.id === sp.selecionada) ?? result.items[0];
  const readerHref = (id?: string, enabled = true) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) if (value && !["leitura", "selecionada"].includes(key)) params.set(key, value);
    if (enabled) params.set("leitura", "1");
    if (id && enabled) params.set("selecionada", id);
    return `/caixa-de-entrada?${params}`;
  };
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
  const href = (key: string) => {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(sp)) if (value && !["pagina", "caixa", "status"].includes(name)) params.set(name, value);
    if (key) params.set("caixa", key);
    return `/caixa-de-entrada${params.size ? `?${params}` : ""}`;
  };

  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(sp)) if (value && key !== "pagina") params.set(key, value);
    params.set("pagina", String(page));
    return `/caixa-de-entrada?${params}`;
  };
  const advancedCount = [tag, sp.duplicadas === "1", sp.tipo, sp.origem, sp.orgao, sp.recebidaDe, sp.recebidaAte, sp.publicadaDe, sp.publicadaAte, sp.ordem === "asc", sp.porPagina && sp.porPagina !== "25", professionalId, originKind, viewed].filter(Boolean).length;
  const clearParams = new URLSearchParams();
  if (reading) clearParams.set("leitura", "1");
  if (current) clearParams.set("caixa", current);
  const clearHref = `/caixa-de-entrada${clearParams.size ? `?${clearParams}` : ""}`;
  return (
    <div className={reading ? "mx-auto max-w-[1800px]" : "mx-auto max-w-7xl"}>
      <PageHeader
        title="Caixa de entrada jurídica"
        description="Receba, distribua e trate as intimações do escritório. Cada publicação segue até a tarefa ou o prazo correspondente."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={readerHref(undefined, !reading)} className={buttonVariants({ variant: "secondary" })}>{reading ? "Ver tabela" : "Leitura integrada"}</Link>
            {can(ctx, "members:manage") ? <Link href="/caixa-de-entrada/equipes" className={buttonVariants({ variant: "secondary" })}>Equipes</Link> : null}
            {canWrite ? (
              <Link href="/caixa-de-entrada/nova" className={buttonVariants({})}>
                <Plus className="h-4 w-4" aria-hidden /> Nova intimação
              </Link>
            ) : null}
          </div>
        }
      />
      {v2 ? <LiveRefresh cursor={cursor} /> : null}
      {problems.length > 0 ? (
        <div className="mb-4" data-testid="inbox-monitor-alert">
          <Alert tone="warning">
            <strong>Atenção: {problems.length === 1 ? "1 nome monitorado não está" : `${problems.length} nomes monitorados não estão`} sendo capturado{problems.length === 1 ? "" : "s"}.</strong>{" "}
            {problems.map((p) => `${p.label} (${p.oab}) — ${REASON[p.reason]}`).join("; ")}. Publicações novas desses nomes podem não ter chegado.{" "}
            {can(ctx, "integrations:manage") ? <Link className="underline" href="/integracoes">Verificar em Integrações</Link> : "Avise quem administra as integrações."}
          </Alert>
        </div>
      ) : null}
      <div className={cn("mb-4 grid grid-cols-2 gap-2", v2 ? "md:grid-cols-5" : "md:grid-cols-4")} data-testid="inbox-day-counts" role="group" aria-label="Resumo do dia">
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
        {v2 ? (
          <Card className="px-4 py-3">
            <div className="text-2xl font-semibold tabular-nums" data-testid="day-unviewed">{unviewed}</div>
            <Link href="/caixa-de-entrada?vista=nao" className="text-xs text-muted underline">Ainda não vistas no LegalOS</Link>
          </Card>
        ) : null}
      </div>
      <nav aria-label="Situação" className="mb-5 min-w-0">
        <div className="md:hidden"><SectionSelect base="/caixa-de-entrada" label="Caixa de trabalho" current={current} tabs={tabs.map((t) => ({ ...t, href: href(t.key) }))} /></div>
        <div className="hidden gap-1 overflow-x-auto border-b border-border md:flex">
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
        </div>
      </nav>
      <form method="get" className="mb-5 space-y-3" role="search" aria-label="Filtrar intimações">
        {reading ? <input type="hidden" name="leitura" value="1" /> : null}
        {status && !box ? <input type="hidden" name="status" value={status} /> : null}
        {box ? <input type="hidden" name="caixa" value={current} /> : null}
        <div className="grid items-center gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_240px_auto_auto]">
        <div className="relative min-w-0">
          <label htmlFor="q" className="sr-only">Buscar</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Título, teor ou número do processo" className="pl-9" />
        </div>
        <div>
          <label htmlFor="responsavel" className="sr-only">Responsável</label>
          <Select id="responsavel" name="responsavel" defaultValue={sp.responsavel ?? ""}>
            <option value="">Todos os responsáveis</option>
            <option value="eu">Distribuídas para mim</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </div>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>Filtrar</button>
        <Link href={clearHref} className={buttonVariants({ variant: "ghost" })}>Limpar filtros</Link>
        </div>
        <FilterPanel label="Mais filtros de intimações" activeCount={advancedCount}>
        <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tags.length ? (
          <div>
            <label htmlFor="etiqueta" className="sr-only">Etiqueta</label>
            <Select id="etiqueta" name="etiqueta" defaultValue={sp.etiqueta ?? ""}>
              <option value="">Todas as etiquetas</option>
              {tags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </div>
        ) : null}
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" name="duplicadas" value="1" defaultChecked={sp.duplicadas === "1"} className="h-4 w-4 accent-primary" /> Possíveis duplicatas
        </label>
        <label className="text-sm">Tipo<Select name="tipo" defaultValue={sp.tipo ?? ""}><option value="">Todos os tipos</option>{NOTICE_KINDS.map(k => <option key={k} value={k}>{NOTICE_KIND_LABEL[k]}</option>)}</Select></label>
        <label className="text-sm">Origem<Select name="origem" defaultValue={sp.origem ?? ""}><option value="">Todas as origens</option>{Object.entries(ORIGIN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></label>
        {v2 ? (
          <>
            <label className="text-sm">Profissional (OAB)<Select name="profissional" defaultValue={professionalId ?? ""}><option value="">Todos</option>{professionals.map((p) => <option key={p.id} value={p.id}>{p.name} — OAB {p.oabNumber}/{p.oabUf}</option>)}</Select></label>
            <label className="text-sm">Tipo de comunicação<Select name="fonte" defaultValue={originKind ?? ""}><option value="">Todas</option>{COMMUNICATION_ORIGINS.map((o) => <option key={o} value={o}>{COMMUNICATION_ORIGIN_LABEL[o]}</option>)}</Select></label>
            <label className="text-sm">No LegalOS<Select name="vista" defaultValue={viewed === "no" ? "nao" : viewed === "yes" ? "sim" : ""}><option value="">Vistas e não vistas</option><option value="nao">Ainda não vistas</option><option value="sim">Já vistas</option></Select></label>
          </>
        ) : null}
        <label className="text-sm">Tribunal / órgão<Input name="orgao" defaultValue={sp.orgao ?? ""} maxLength={120} /></label>
        <label className="text-sm">Recebida de<Input type="date" name="recebidaDe" defaultValue={sp.recebidaDe ?? ""} /></label>
        <label className="text-sm">Recebida até<Input type="date" name="recebidaAte" defaultValue={sp.recebidaAte ?? ""} /></label>
        <label className="text-sm">Publicada de<Input type="date" name="publicadaDe" defaultValue={sp.publicadaDe ?? ""} /></label>
        <label className="text-sm">Publicada até<Input type="date" name="publicadaAte" defaultValue={sp.publicadaAte ?? ""} /></label>
        <label className="text-sm">Ordem<Select name="ordem" defaultValue={parsed.data.sort}><option value="desc">Mais recentes primeiro</option><option value="asc">Mais antigas primeiro</option></Select></label>
        <label className="text-sm">Por página<Select name="porPagina" defaultValue={parsed.data.pageSize}>{[25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}</Select></label>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>Aplicar filtros</button>
        </div>
        </FilterPanel>
      </form>
      <p className="mb-2 text-sm text-muted">{result.total} intimação(ões) · página {result.page} de {result.pageCount}</p>
      {result.items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">Nenhuma intimação encontrada.</Card>
      ) : reading ? (
        <div className="grid items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <nav aria-label="Lista de leitura" className="space-y-2 xl:sticky xl:top-4 xl:max-h-[85vh] xl:overflow-y-auto">
            {result.items.map(n => <Link key={n.id} scroll={false} href={readerHref(n.id)} aria-current={selected?.id === n.id ? "true" : undefined} className={cn("block rounded-lg border p-3 text-sm", selected?.id === n.id ? "border-primary bg-surface-2" : "border-border")}>
              <p className="font-medium">{n.title}</p><p className="mt-1 text-xs text-muted">{n.caseNumber ?? "Sem número"} · {formatYmd(dateToYmd(n.receivedAt))}</p>
              <p className="text-xs text-muted">{n.court}</p>
            </Link>)}
          </nav>
          <section aria-label="Intimação selecionada" className="min-w-0">{selected ? <NoticeReader key={selected.id} id={selected.id} embedded /> : null}</section>
        </div>
      ) : (
        <NoticeTable key={JSON.stringify([sp, result.items.map(n => [n.id, n.updatedAt])])} rows={result.items} members={members} teams={teams} canWrite={canWrite} v2={v2} />
      )}
      <nav aria-label="Paginação de intimações" className="mt-5 flex flex-wrap items-center justify-between gap-3">
        {result.page > 1 ? <Link className={buttonVariants({ variant: "secondary" })} href={pageHref(result.page - 1)}>Página anterior</Link> : <span />}
        <span className="text-sm">Página {result.page} de {result.pageCount} · {result.total} resultado(s)</span>
        {result.page < result.pageCount ? <Link className={buttonVariants({ variant: "secondary" })} href={pageHref(result.page + 1)}>Próxima página</Link> : <span />}
      </nav>
    </div>
  );
}
