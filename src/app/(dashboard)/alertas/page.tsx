import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { TabsNav } from "@/components/ui/tabs-nav";
import { formatDate, formatDateTime } from "@/lib/dates/format";
import { dateToYmd, formatYmd } from "@/lib/dates/ymd";
import { alertCounts, alertItems, availableAlertTabs, isAlertTab, type AlertItem } from "@/server/services/insights.service";
import { SendToClient } from "@/modules/whatsapp/send-to-client";
import { clientMessageTarget } from "@/server/services/chat-send.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Central de alertas" };
export const dynamic = "force-dynamic";

const EMPTY: Record<string, string> = {
  publicacoes: "Nenhuma publicação nova esperando tratamento.",
  andamentos: "Nenhum andamento novo nos últimos 7 dias.",
  processos: "Nenhum processo ativo parado há mais de 60 dias.",
  tarefas: "Nenhuma tarefa atrasada ou vencendo hoje.",
  prazos: "Nenhum prazo vencido ou nos próximos 7 dias.",
  agenda: "Nenhum compromisso hoje ou nos próximos 2 dias.",
  financeiro: "Nenhum lançamento vencido ou vencendo em até 3 dias.",
  integracao: "Todas as integrações estão em ordem.",
  aniversarios: "Nenhum cliente faz aniversário hoje ou nos próximos 7 dias (ou ainda não há datas de nascimento cadastradas).",
};
const DESC: Record<string, string> = {
  publicacoes: "Publicações novas na caixa de entrada.",
  andamentos: "Movimentações dos últimos 7 dias nos processos que você pode ver.",
  processos: "Processos ativos sem nenhuma movimentação há mais de 60 dias.",
  tarefas: "Tarefas em aberto atrasadas ou que vencem hoje.",
  prazos: "Prazos não cumpridos já vencidos ou que vencem em até 7 dias.",
  agenda: "Compromissos de hoje até depois de amanhã.",
  financeiro: "Lançamentos em aberto vencidos ou que vencem em até 3 dias.",
  integracao: "Capturas do DJEN, certificados digitais e WhatsApp.",
  aniversarios: "Clientes pessoa física que fazem aniversário hoje ou nos próximos 7 dias. Você pode enviar os parabéns pelo WhatsApp, revisando a mensagem antes.",
};

function when(i: AlertItem, tz: string): string | null {
  if (!i.when) return null;
  if (i.whenKind === "ymd") return formatYmd(typeof i.when === "string" ? i.when.slice(0, 10) : dateToYmd(i.when));
  if (i.whenKind === "date") return formatDate(i.when, tz);
  return formatDateTime(i.when, tz);
}

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { ctx, organization } = await requireTenant();
  const tabs = availableAlertTabs(ctx);
  const sp = await searchParams;
  const current = sp.aba && isAlertTab(sp.aba) && tabs.some((t) => t.key === sp.aba) ? sp.aba : (tabs[0]?.key ?? "tarefas");
  const [counts, items] = await Promise.all([alertCounts(ctx), tabs.length ? alertItems(ctx, current) : Promise.resolve([])]);
  // aniversários não são "alerta": ficam de fora do total que pede atenção
  const total = Object.entries(counts).reduce((a, [k, v]) => (k === "aniversarios" ? a : a + v), 0);
  const birthdayTargets = current === "aniversarios" ? new Map((await Promise.all(items.map((i) => clientMessageTarget(ctx, i.id, organization.name, "birthday")))).filter((t): t is NonNullable<typeof t> => !!t).map((t) => [t.clientId, t])) : null;
  return (
    <div className="mx-auto max-w-4xl" data-testid="alerts-page">
      <PageHeader title="Central de alertas" description={tabs.length ? `${total} item(ns) pedindo atenção. Cada alerta leva direto ao lugar onde você resolve.` : "Seu perfil não tem acesso a nenhum módulo com alertas."} />
      {tabs.length ? (
        <>
          <TabsNav base="/alertas" current={current} tabs={tabs.map((t) => ({ key: t.key, label: t.label, count: counts[t.key] ?? 0 }))} />
          <p className="mb-3 text-xs text-muted">{DESC[current]}{(counts[current] ?? 0) > items.length && current !== "integracao" ? ` Mostrando os ${items.length} primeiros de ${counts[current]}.` : ""}</p>
          {items.length === 0 ? (
            <Card className="p-10 text-center text-sm text-muted" data-testid="alerts-empty">{EMPTY[current]}</Card>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-surface" data-testid="alerts-list">
              {items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{i.title}</p>
                    {i.sub ? <p className="mt-0.5 truncate text-xs text-muted">{i.sub}</p> : null}
                    {when(i, organization.timezone) ? <p className="mt-0.5 text-[11px] text-muted">{when(i, organization.timezone)}</p> : null}
                  </div>
                  {i.badge ? <Badge tone={i.tone === "danger" ? "danger" : i.tone === "warning" ? "warning" : i.tone === "info" ? "info" : "neutral"}>{i.badge}</Badge> : null}
                  {birthdayTargets?.get(i.id) ? <SendToClient target={birthdayTargets.get(i.id)!} source="birthday" compact /> : null}
                  <Link href={i.href} className="shrink-0 text-sm underline">{i.action}</Link>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  );
}
