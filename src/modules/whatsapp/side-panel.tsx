"use client";

import Link from "next/link";
import * as React from "react";
import { CalendarDays, CircleDollarSign, History, Scale, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatMoneyBR } from "@/lib/validation/money";
import { CASE_STATUS_LABEL } from "@/modules/cases/schemas";
import { CLIENT_STATUS_LABEL, CLIENT_TYPE_LABEL } from "@/modules/clients/schemas";
import { LEAD_STAGE_LABEL } from "@/modules/crm/schemas";
import { EVENT_KIND_LABEL } from "@/modules/agenda/schemas";
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/modules/tasks/schemas";
import { DEADLINE_STATUS_LABEL } from "@/modules/deadlines/schemas";
import type { PanelData } from "@/server/services/chat-panel.service";

type Serial<T> = T extends Date ? string : T extends (infer U)[] ? Serial<U>[] : T extends object ? { [K in keyof T]: Serial<T[K]> } : T;
export type PanelView = Serial<PanelData>;

const TABS = [
  { key: "contato", label: "Contato", Icon: UserRound },
  { key: "processo", label: "Processo", Icon: Scale },
  { key: "agenda", label: "Agenda", Icon: CalendarDays },
  { key: "financeiro", label: "Financeiro", Icon: CircleDollarSign },
  { key: "historico", label: "Histórico", Icon: History },
] as const;
type Tab = (typeof TABS)[number]["key"];

const dt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const day = (ymd: string) => ymd.split("-").reverse().join("/");
const minutes = (m: number) => (m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} dia(s)`);
const label = <T extends Record<string, string>>(map: T, k: string) => (map as Record<string, string>)[k] ?? k;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5 border-b border-border px-3 py-3 last:border-b-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-primary-text">{title}</h3>
      {children}
    </section>
  );
}
const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex justify-between gap-3 text-xs"><span className="text-muted">{k}</span><span className="text-right font-medium">{v}</span></div>
);
const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-xs text-muted">{children}</p>;

export function SidePanel({ title, phone, data, meta, actions, controls, extras }: { title: string; phone: string; data: PanelView; meta: React.ReactNode; actions: React.ReactNode; controls?: React.ReactNode; extras?: React.ReactNode }) {
  const [tab, setTab] = React.useState<Tab>("contato");
  const d = data;
  const counts: Partial<Record<Tab, number>> = {
    agenda: d.agenda ? d.agenda.tasks.length + d.agenda.deadlines.length + d.agenda.events.length : undefined,
    financeiro: d.finance?.overdueCount,
  };
  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-border xl:border-l" data-testid="wa-side">
      <div role="tablist" aria-label="Informações da conversa" className="flex overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button key={t.key} role="tab" type="button" title={t.label} aria-label={t.label} aria-selected={tab === t.key} data-testid={`side-tab-${t.key}`} onClick={() => setTab(t.key)} className={`relative flex flex-1 items-center justify-center px-2 py-2.5 ${tab === t.key ? "border-b-2 border-primary text-primary-text" : "text-muted hover:bg-surface-2"}`}>
            <t.Icon className="h-4 w-4" aria-hidden="true" />
            {counts[t.key] ? <span className="absolute right-1 top-1 rounded-full bg-danger px-1.5 text-[10px] text-white" data-testid={`side-count-${t.key}`}>{counts[t.key]}</span> : null}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" role="tabpanel">
        {tab === "contato" ? (
          <>
            {controls ? <Section title="Atribuição">{controls}</Section> : null}
            <Section title="Contato">
              <div className="text-sm font-semibold" data-testid="side-name">{title}</div>
              <div className="text-xs text-muted">{phone}</div>
              {d.client ? (
                <div className="mt-2 space-y-1 rounded-md border border-border p-2" data-testid="side-client">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/clientes/${d.client.id}`} className="text-sm font-medium underline">{d.client.name}</Link>
                    <Badge tone={d.client.status === "ACTIVE" ? "success" : "neutral"}>{label(CLIENT_STATUS_LABEL, d.client.status)}</Badge>
                  </div>
                  <Row k="Tipo" v={label(CLIENT_TYPE_LABEL, d.client.type)} />
                  {d.client.document ? <Row k="CPF/CNPJ" v={d.client.document} /> : null}
                  {d.client.email ? <Row k="E-mail" v={d.client.email} /> : null}
                  {d.client.phone ? <Row k="Telefone cadastrado" v={d.client.phone} /> : null}
                </div>
              ) : <Empty>Cliente não vinculado.</Empty>}
              {d.lead ? (
                <div className="mt-2 space-y-1 rounded-md border border-border p-2" data-testid="side-lead">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/crm/${d.lead.id}`} className="text-sm font-medium underline">{d.lead.name}</Link>
                    <Badge tone="info">{label(LEAD_STAGE_LABEL, d.lead.stage)}</Badge>
                  </div>
                  {d.lead.interest ? <Row k="Interesse" v={d.lead.interest} /> : null}
                  {d.lead.estimatedValue ? <Row k="Valor estimado" v={formatMoneyBR(d.lead.estimatedValue)} /> : null}
                  {d.lead.nextActionDate ? <Row k="Próxima ação" v={day(d.lead.nextActionDate)} /> : null}
                </div>
              ) : null}
            </Section>
            <Section title="Atendimento">
              <div data-testid="side-stats" className="space-y-1">
                <Row k="Primeiro contato" v={dt(d.stats.firstContact)} />
                <Row k="Última mensagem do cliente" v={d.stats.lastInboundAt ? dt(d.stats.lastInboundAt) : "—"} />
                <Row k="Mensagens recebidas / enviadas" v={`${d.stats.incoming} / ${d.stats.outgoing}`} />
                <Row k="Notas internas" v={d.stats.notes} />
                <Row k="1ª resposta humana em" v={d.stats.firstReplyMinutes == null ? "—" : minutes(d.stats.firstReplyMinutes)} />
              </div>
              {d.otherConversations.length > 0 ? (
                <div className="pt-1" data-testid="side-others">
                  <div className="text-xs text-muted">Outras conversas do mesmo cliente</div>
                  {d.otherConversations.map((o) => <Link key={o.id} href={`/atendimento?f=${o.status === "OPEN" ? "open" : "closed"}&c=${o.id}`} className="block text-xs underline">{o.phone} · {o.status === "OPEN" ? "aberta" : "encerrada"}</Link>)}
                </div>
              ) : null}
            </Section>
            {meta}
            {extras}
          </>
        ) : null}

        {tab === "processo" ? (
          <Section title="Processo vinculado">
            {d.caseInfo ? (
              <div className="space-y-1" data-testid="side-case">
                <Link href={`/processos/${d.caseInfo.id}`} className="text-sm font-medium underline">{d.caseInfo.number ?? d.caseInfo.title}</Link>
                {d.caseInfo.number ? <div className="text-xs">{d.caseInfo.title}</div> : null}
                <Row k="Situação" v={label(CASE_STATUS_LABEL, d.caseInfo.status)} />
                {d.caseInfo.area ? <Row k="Área" v={d.caseInfo.area} /> : null}
                {d.caseInfo.court ? <Row k="Tribunal" v={d.caseInfo.court} /> : null}
                {d.caseInfo.phase ? <Row k="Fase" v={d.caseInfo.phase} /> : null}
                {d.caseInfo.claimValue ? <Row k="Valor da causa" v={formatMoneyBR(d.caseInfo.claimValue)} /> : null}
                <div className="pt-2 text-xs font-medium">Últimos andamentos</div>
                {d.caseInfo.recent.length === 0 ? <Empty>Sem andamentos registrados.</Empty> : (
                  <ul className="space-y-1">
                    {d.caseInfo.recent.map((e) => <li key={e.id} className="text-xs"><span className="text-muted">{dt(e.at)}</span> — {e.title}</li>)}
                  </ul>
                )}
              </div>
            ) : <Empty>Nenhum processo vinculado (ou você não tem acesso). Use “Vincular processo” em Ações rápidas.</Empty>}
          </Section>
        ) : null}

        {tab === "agenda" ? (
          d.agenda ? (
            <>
              <Section title="Tarefas em aberto">
                {d.agenda.tasks.length === 0 ? <Empty>Nenhuma tarefa em aberto.</Empty> : d.agenda.tasks.map((t) => (
                  <div key={t.id} className="text-xs" data-testid="side-task">
                    <Link href={`/tarefas/${t.id}`} className="font-medium underline">{t.title}</Link>
                    <div className="text-muted">{label(TASK_STATUS_LABEL, t.status)} · {label(TASK_PRIORITY_LABEL, t.priority)}{t.due ? ` · ${t.overdue ? "atrasada, venceu " : "vence "}${day(t.due)}` : ""}</div>
                  </div>
                ))}
              </Section>
              <Section title="Prazos do processo">
                {d.agenda.deadlines.length === 0 ? <Empty>Nenhum prazo em aberto.</Empty> : d.agenda.deadlines.map((p) => (
                  <div key={p.id} className="text-xs" data-testid="side-deadline">
                    <Link href={`/prazos/${p.id}`} className="font-medium underline">{p.title}</Link>
                    <div className="text-muted">{label(DEADLINE_STATUS_LABEL, p.status)} · {p.overdue ? "vencido em " : "fatal "}{day(p.due)}</div>
                  </div>
                ))}
              </Section>
              <Section title="Próximos compromissos">
                {d.agenda.events.length === 0 ? <Empty>Nenhum compromisso marcado.</Empty> : d.agenda.events.map((e) => (
                  <div key={e.id} className="text-xs" data-testid="side-event">
                    <Link href={`/agenda/${e.id}`} className="font-medium underline">{e.title}</Link>
                    <div className="text-muted">{label(EVENT_KIND_LABEL, e.kind)} · {dt(e.startsAt)}</div>
                  </div>
                ))}
              </Section>
            </>
          ) : <Section title="Agenda"><Empty>Vincule a conversa a um cliente ou processo para ver tarefas, prazos e compromissos.</Empty></Section>
        ) : null}

        {tab === "financeiro" ? (
          <Section title="Honorários e valores a receber">
            {d.finance ? (
              <div className="space-y-1" data-testid="side-finance">
                <Row k="Em aberto" v={formatMoneyBR(d.finance.openTotal)} />
                <Row k="Vencido" v={<span className={d.finance.overdueCount ? "text-danger" : ""}>{formatMoneyBR(d.finance.overdueTotal)}{d.finance.overdueCount ? ` (${d.finance.overdueCount})` : ""}</span>} />
                {d.finance.entries.length === 0 ? <Empty>Nada a receber deste cliente.</Empty> : (
                  <ul className="space-y-1.5 pt-2">
                    {d.finance.entries.map((e) => (
                      <li key={e.id} className="text-xs" data-testid="side-entry">
                        <Link href={`/financeiro/lancamentos/${e.id}`} className="font-medium underline">{e.description}{e.installment ? ` · ${e.installment}` : ""}</Link>
                        <div className={e.overdue ? "text-danger" : "text-muted"}>{formatMoneyBR(e.remaining)} · {e.overdue ? "venceu " : "vence "}{day(e.due)}</div>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="pt-2 text-[11px] text-muted">Para cobrar pelo WhatsApp, abra o lançamento e use “Cobrar pelo WhatsApp”.</p>
              </div>
            ) : <Empty>Vincule um cliente (e ter permissão do Financeiro) para ver os valores a receber.</Empty>}
          </Section>
        ) : null}

        {tab === "historico" ? (
          <Section title="Histórico da conversa">
            {d.history.length === 0 ? <Empty>Nada registrado ainda.</Empty> : (
              <ul className="space-y-1.5" data-testid="side-history">
                {d.history.map((h) => <li key={h.id} className="text-xs"><span className="text-muted">{dt(h.at)}</span> — {h.text}</li>)}
              </ul>
            )}
          </Section>
        ) : null}
      </div>

      <details open className="border-t border-border" data-testid="side-actions">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary-text">Ações rápidas</summary>
        {actions}
      </details>
    </aside>
  );
}
