"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form";
import { attachToDocumentsAction, createDeadlineFromChatAction, createEventFromChatAction, createLeadFromChatAction, createTaskFromChatAction, linkCaseAction, searchCasesAction } from "./actions";

export type Links = {
  client: { id: string; name: string } | null;
  case: { id: string; number: string | null; title: string } | null;
  lead: { id: string; name: string } | null;
};
export type Can = { cases: boolean; tasks: boolean; events: boolean; deadlines: boolean; leads: boolean; documents: boolean };
export type Panel = { kind: "case" | "task" | "event" | "deadline" | "lead"; messageId?: string; seed?: string } | null;

type R = { ok: boolean; message?: string; fieldErrors?: Record<string, string[] | undefined> };
const errText = (r: R, fallback: string) => {
  const f = r.fieldErrors ? Object.values(r.fieldErrors).flat().filter(Boolean).join(" ") : "";
  return r.message && r.message !== "Corrija os campos destacados." ? r.message : f || r.message || fallback;
};
const today = () => new Date().toISOString().slice(0, 10);
const LABEL = { case: "Vincular processo", task: "Criar tarefa", event: "Marcar compromisso", deadline: "Cadastrar prazo", lead: "Criar lead no CRM" } as const;

/** Ligações da conversa com o resto do sistema e atalhos para criar tarefa, compromisso, prazo e lead sem sair do atendimento. */
export function ChatActions({ chatId, title, links, can, team, me, panel, setPanel, onMsg }: { chatId: string; title: string; links: Links; can: Can; team: { id: string; name: string }[]; me: string; panel: Panel; setPanel: (p: Panel) => void; onMsg: (m: { tone: "error" | "success"; text: string } | null) => void }) {
  const router = useRouter();
  const setMsg = onMsg;
  const [pending, start] = React.useTransition();
  const done = (text: string) => { setMsg({ tone: "success", text }); setPanel(null); router.refresh(); };
  const run = (fn: () => Promise<R>, ok: string) => start(async () => { const r = await fn(); if (r.ok) done(ok); else setMsg({ tone: "error", text: errText(r, "Não foi possível concluir.") }); });

  const [f, setF] = React.useState({ title: panel?.seed ?? "", date: "", time: "09:00", endTime: "", kind: "MEETING", priority: "NORMAL", assignee: me, notes: "", interest: "", name: "" });
  const [q, setQ] = React.useState("");
  const [opts, setOpts] = React.useState<{ id: string; number: string | null; title: string }[]>([]);
  const wantsCases = panel?.kind === "case";
  React.useEffect(() => {
    if (wantsCases) void searchCasesAction(chatId, "").then((r) => setOpts(r.data ?? []));
  }, [wantsCases, chatId]);

  const btn = (kind: NonNullable<Panel>["kind"], allowed: boolean) => (allowed ? <Button key={kind} size="sm" variant={panel?.kind === kind ? "primary" : "secondary"} onClick={() => setPanel(panel?.kind === kind ? null : { kind })}>{LABEL[kind]}</Button> : null);
  const msgId = panel?.messageId ?? null;

  return (
    <div className="space-y-2 border-b border-border p-3 text-sm" data-testid="wa-links">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>Cliente: {links.client ? <Link className="underline" href={`/clientes/${links.client.id}`}>{links.client.name}</Link> : "não vinculado"}</span>
        <span>Processo: {links.case ? <Link className="underline" href={`/processos/${links.case.id}`}>{links.case.number ?? links.case.title}</Link> : "não vinculado"}</span>
        {links.lead ? <span>Lead: <Link className="underline" href={`/crm/${links.lead.id}`}>{links.lead.name}</Link></span> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {btn("case", can.cases)}
        {btn("task", can.tasks)}
        {btn("event", can.events)}
        {btn("deadline", can.deadlines && !!links.case)}
        {!links.client && !links.lead ? btn("lead", can.leads) : null}
      </div>

      {panel?.kind === "case" ? (
        <div className="space-y-2" data-testid="wa-panel-case">
          <div className="flex gap-2">
            <Input aria-label="Buscar processo" placeholder="Número ou título do processo" value={q} onChange={(e) => setQ(e.target.value)} />
            <Button size="sm" variant="secondary" loading={pending} onClick={() => start(async () => { const r = await searchCasesAction(chatId, q); setOpts(r.data ?? []); })}>Buscar</Button>
          </div>
          {opts.length === 0 ? <p className="text-xs text-muted">Nenhum processo encontrado. Busque pelo número ou título.</p> : null}
          <div className="flex flex-wrap gap-2">
            {opts.map((o) => <button key={o.id} type="button" className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-2" onClick={() => run(() => linkCaseAction(chatId, o.id), "Conversa vinculada ao processo.")}>{o.number ?? o.title}</button>)}
          </div>
          {links.case ? <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => linkCaseAction(chatId, null), "Vínculo com o processo removido.")}>Desvincular do processo atual</Button> : null}
        </div>
      ) : null}

      {panel?.kind === "task" ? (
        <div className="grid gap-2 md:grid-cols-2" data-testid="wa-panel-task">
          <Input aria-label="Título da tarefa" className="md:col-span-2" placeholder={`Ex.: Retornar ligação para ${title}`} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <Input aria-label="Prazo da tarefa" type="date" min={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <Select aria-label="Responsável pela tarefa" value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })}>{team.map((u) => <option key={u.id} value={u.id}>{u.name}{u.id === me ? " (eu)" : ""}</option>)}</Select>
          <Select aria-label="Prioridade" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="LOW">Baixa</option><option value="NORMAL">Normal</option><option value="HIGH">Alta</option><option value="URGENT">Urgente</option></Select>
          <Textarea aria-label="Detalhes da tarefa" className="md:col-span-2" rows={2} placeholder="Detalhes (opcional). A mensagem e o link da conversa vão junto." value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          <div className="md:col-span-2"><Button size="sm" loading={pending} onClick={() => run(() => createTaskFromChatAction(chatId, { title: f.title, description: f.notes, dueDate: f.date, priority: f.priority as "NORMAL", assigneeId: f.assignee, messageId: msgId }), "Tarefa criada. Ela já aparece em Tarefas.")}>Criar tarefa</Button></div>
        </div>
      ) : null}

      {panel?.kind === "event" ? (
        <div className="grid gap-2 md:grid-cols-2" data-testid="wa-panel-event">
          <Input aria-label="Título do compromisso" className="md:col-span-2" placeholder="Ex.: Reunião com o cliente" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <Select aria-label="Tipo de compromisso" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="MEETING">Reunião</option><option value="HEARING">Audiência</option><option value="DILIGENCE">Diligência</option><option value="OTHER">Outro</option></Select>
          <Input aria-label="Data do compromisso" type="date" min={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <Input aria-label="Início" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
          <Input aria-label="Término" type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} />
          <div className="md:col-span-2"><Button size="sm" loading={pending} onClick={() => run(() => createEventFromChatAction(chatId, { title: f.title, date: f.date, kind: f.kind as "MEETING", startTime: f.time, endTime: f.endTime, messageId: msgId }), "Compromisso marcado na Agenda.")}>Marcar na Agenda</Button></div>
        </div>
      ) : null}

      {panel?.kind === "deadline" ? (
        <div className="grid gap-2 md:grid-cols-2" data-testid="wa-panel-deadline">
          <Alert tone="info" className="md:col-span-2">O prazo fica como rascunho até alguém validar em Prazos (regra do sistema).</Alert>
          <Input aria-label="Título do prazo" className="md:col-span-2" placeholder="Ex.: Juntar documentos pedidos pelo cliente" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <Input aria-label="Data fatal" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <div><Button size="sm" loading={pending} onClick={() => run(() => createDeadlineFromChatAction(chatId, { title: f.title, dueDate: f.date, messageId: msgId }), "Prazo cadastrado como rascunho. Valide em Prazos.")}>Cadastrar prazo</Button></div>
        </div>
      ) : null}

      {panel?.kind === "lead" ? (
        <div className="grid gap-2 md:grid-cols-2" data-testid="wa-panel-lead">
          <Input aria-label="Nome do lead" placeholder={title} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input aria-label="Interesse" placeholder="Ex.: Aposentadoria por invalidez" value={f.interest} onChange={(e) => setF({ ...f, interest: e.target.value })} />
          <div className="md:col-span-2"><Button size="sm" loading={pending} onClick={() => run(() => createLeadFromChatAction(chatId, { name: f.name || undefined, interest: f.interest || undefined }), "Lead criado no CRM, com origem WhatsApp.")}>Criar lead</Button></div>
        </div>
      ) : null}
    </div>
  );
}

/** Ações de uma mensagem: criar tarefa a partir dela e guardar o arquivo recebido em Documentos. */
export function MessageActions({ messageId, excerpt, hasMedia, links, can, onPanel, onDone }: { messageId: string; excerpt: string; hasMedia: boolean; links: Links; can: Can; onPanel: (p: Panel) => void; onDone: (m: { tone: "error" | "success"; text: string }) => void }) {
  const [pending, start] = React.useTransition();
  const attach = (target: "case" | "client") => start(async () => {
    const r = await attachToDocumentsAction(messageId, target);
    onDone(r.ok ? { tone: "success", text: `Arquivo guardado em Documentos (${target === "case" ? "processo" : "cliente"}).` } : { tone: "error", text: errText(r, "Não foi possível guardar o arquivo.") });
  });
  const seed = excerpt.replace(/\s+/g, " ").slice(0, 80);
  if (!can.tasks && !(hasMedia && can.documents)) return null;
  return (
    <div data-testid="wa-msg-actions">
      <Menu label="Ações da mensagem" trigger={<ChevronDown className="h-4 w-4" aria-hidden="true" />}>
        {(close) => (
          <>
            {can.tasks ? <MenuItem onClick={() => { close(); onPanel({ kind: "task", messageId, seed: seed ? `Tratar: ${seed}` : "" }); }}>Criar tarefa</MenuItem> : null}
            {hasMedia && can.documents && links.case ? <MenuItem disabled={pending} onClick={() => { close(); attach("case"); }}>Guardar no processo</MenuItem> : null}
            {hasMedia && can.documents && links.client ? <MenuItem disabled={pending} onClick={() => { close(); attach("client"); }}>Guardar no cliente</MenuItem> : null}
          </>
        )}
      </Menu>
    </div>
  );
}
