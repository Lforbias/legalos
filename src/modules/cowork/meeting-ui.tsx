"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { actionItemAction, attendanceAction, createMeetingAction, meetingStatusAction, minutesAction, participantsAction, respondMeetingAction } from "./actions";
import { SharePicker } from "./composer";
import { ATTENDANCE_LABEL, RSVP_LABEL, WORK_PURPOSE_LABEL, WORK_PURPOSES, type WorkPurpose } from "./constants";
import { PeoplePicker } from "./dialogs";
import type { Person } from "./types";
import { newNonce } from "./ui";

const inputCls = "h-10 w-full rounded-lg border border-border bg-bg/45 px-3 text-sm focus:border-primary focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium text-muted";

export function MeetingForm({ people, meId, channels, defaultChannelId, canAgenda, canCases, today }: { people: Person[]; meId: string; channels: { id: string; name: string }[]; defaultChannelId: string; canAgenda: boolean; canCases: boolean; today: string }) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [date, setDate] = React.useState(today);
  const [startTime, setStartTime] = React.useState("10:00");
  const [endTime, setEndTime] = React.useState("10:30");
  const [participants, setParticipants] = React.useState<string[]>([]);
  const [channelId, setChannelId] = React.useState(defaultChannelId);
  const [caseRef, setCaseRef] = React.useState<{ id: string; title: string } | null>(null);
  const [pickCase, setPickCase] = React.useState(false);
  const [addToAgenda, setAddToAgenda] = React.useState(canAgenda);
  const [requestKey] = React.useState(newNonce);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createMeetingAction({ title, description, date, startTime, endTime, participantIds: participants, channelId, caseId: caseRef?.id ?? "", addToAgenda, requestKey });
          if (r.ok && r.data) router.push(`/cowork/reunioes/${r.data.id}`);
          else setError(r.message ?? "Não foi possível agendar.");
        });
      }}
    >
      <label className="block"><span className={labelCls}>Título</span><input required minLength={3} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} data-testid="meeting-title" /></label>
      <label className="block"><span className={labelCls}>Pauta (opcional)</span><textarea rows={3} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border border-border bg-bg/45 px-3 py-2 text-sm focus:border-primary focus:outline-none" /></label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block"><span className={labelCls}>Data</span><input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} data-testid="meeting-date" /></label>
        <label className="block"><span className={labelCls}>Início</span><input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} /></label>
        <label className="block"><span className={labelCls}>Término</span><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={labelCls}>Conversa vinculada (opcional)</span>
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className={inputCls}>
            <option value="">Nenhuma</option>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        {canCases ? (
          <div>
            <span className={labelCls}>Processo vinculado (opcional)</span>
            {caseRef ? <span className="flex h-10 items-center justify-between rounded-lg border border-border px-3 text-sm"><span className="truncate">{caseRef.title}</span><button type="button" className="text-xs underline" onClick={() => setCaseRef(null)}>Remover</button></span> : <button type="button" className="h-10 text-xs font-medium text-accent-text underline" onClick={() => setPickCase(true)}>Escolher processo</button>}
          </div>
        ) : null}
      </div>
      <div>
        <span className={labelCls}>Participantes</span>
        <PeoplePicker people={people} selected={participants} onChange={setParticipants} exclude={[meId]} />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={addToAgenda} disabled={!canAgenda} onChange={(e) => setAddToAgenda(e.target.checked)} className="mt-0.5" />
        <span>Adicionar à agenda do escritório<span className="block text-xs text-muted">{canAgenda ? "Cria o compromisso na Agenda (visível a quem vê a agenda do escritório)." : "Seu perfil não cria compromissos na agenda; a reunião fica só no Cowork."}</span></span>
      </label>
      <p className="rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-xs text-muted">Áudio e vídeo ainda não estão habilitados nesta instalação: a reunião é organizada aqui (convites, agenda, presença, ata e encaminhamentos) e realizada presencialmente ou na ferramenta que o escritório já usa.</p>
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      <div className="flex justify-end"><Button type="submit" loading={pending} data-testid="meeting-submit">Agendar reunião</Button></div>
      {pickCase ? <SharePicker kinds={["CASE"]} onClose={() => setPickCase(false)} onPick={(r) => { setCaseRef({ id: r.resourceId, title: r.title }); setPickCase(false); }} /> : null}
    </form>
  );
}

type Participant = { userId: string; name: string; isHost: boolean; rsvp: keyof typeof RSVP_LABEL; attendance: keyof typeof ATTENDANCE_LABEL };

export function MeetingControls({ id, status, isParticipant, myRsvp, canAdmin }: { id: string; status: string; isParticipant: boolean; myRsvp: string | null; canAdmin: boolean }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) => start(async () => { const r = await fn(); if (r.ok) { setError(null); router.refresh(); } else setError(r.message ?? "Falha."); });
  const open = status === "SCHEDULED" || status === "IN_PROGRESS";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {isParticipant && open ? (
        <>
          <Button size="sm" variant={myRsvp === "ACCEPTED" ? "primary" : "secondary"} loading={pending} onClick={() => run(() => respondMeetingAction(id, "ACCEPTED"))} data-testid="meeting-accept">Confirmar presença</Button>
          <Button size="sm" variant={myRsvp === "DECLINED" ? "danger" : "secondary"} loading={pending} onClick={() => run(() => respondMeetingAction(id, "DECLINED"))}>Recusar</Button>
        </>
      ) : null}
      {canAdmin && status === "SCHEDULED" ? <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => meetingStatusAction(id, "start"))} data-testid="meeting-start">Iniciar</Button> : null}
      {canAdmin && open ? <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => meetingStatusAction(id, "end"))} data-testid="meeting-end">Encerrar</Button> : null}
      {canAdmin && status === "SCHEDULED" ? <Button size="sm" variant="danger" loading={pending} onClick={() => { if (window.confirm("Cancelar a reunião? Os participantes serão avisados.")) run(() => meetingStatusAction(id, "cancel")); }}>Cancelar reunião</Button> : null}
      {error ? <span className="text-sm text-danger" role="alert">{error}</span> : null}
    </div>
  );
}

export function AttendanceList({ id, participants, canMark, people, canEditParticipants }: { id: string; participants: Participant[]; canMark: boolean; people: Person[]; canEditParticipants: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [selected, setSelected] = React.useState(participants.map((p) => p.userId));
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <div>
      <ul className="divide-y divide-border">
        {participants.map((p) => (
          <li key={p.userId} className="flex flex-wrap items-center gap-2 py-2 text-sm" data-testid="meeting-participant">
            <span className="min-w-0 flex-1 truncate">{p.name}{p.isHost ? <span className="ml-1 text-xs text-muted">(anfitrião)</span> : null}</span>
            <span className="text-xs text-muted">{RSVP_LABEL[p.rsvp]}</span>
            {canMark ? (
              <select aria-label={`Presença de ${p.name}`} value={p.attendance} className="h-8 rounded-md border border-border bg-bg/45 px-2 text-xs" onChange={(e) => start(async () => { const r = await attendanceAction(id, p.userId, e.target.value); if (r.ok) router.refresh(); else setError(r.message ?? "Falha."); })}>
                {(["UNKNOWN", "PRESENT", "ABSENT"] as const).map((a) => <option key={a} value={a}>{ATTENDANCE_LABEL[a]}</option>)}
              </select>
            ) : <span className={cn("text-xs", p.attendance === "PRESENT" ? "text-success" : "text-muted")}>{ATTENDANCE_LABEL[p.attendance]}</span>}
          </li>
        ))}
      </ul>
      {canEditParticipants ? (
        editing ? (
          <div className="mt-3 space-y-2">
            <PeoplePicker people={people} selected={selected} onChange={setSelected} />
            <div className="flex gap-2"><Button size="sm" loading={pending} onClick={() => start(async () => { const r = await participantsAction(id, selected); if (r.ok) { setEditing(false); router.refresh(); } else setError(r.message ?? "Falha."); })}>Salvar participantes</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button></div>
          </div>
        ) : <button type="button" className="mt-2 text-xs font-medium text-accent-text underline" onClick={() => setEditing(true)}>Alterar participantes</button>
      ) : null}
      {error ? <p className="mt-2 text-sm text-danger" role="alert">{error}</p> : null}
    </div>
  );
}

export function MinutesForm({ id, minutes, decisions, canEdit }: { id: string; minutes: string; decisions: string; canEdit: boolean }) {
  const router = useRouter();
  const [m, setM] = React.useState(minutes);
  const [d, setD] = React.useState(decisions);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  if (!canEdit) {
    return (
      <div className="space-y-3 text-sm">
        <div><h4 className="text-xs font-semibold uppercase text-muted">Ata</h4><p className="whitespace-pre-wrap">{minutes || "Ainda não registrada."}</p></div>
        <div><h4 className="text-xs font-semibold uppercase text-muted">Decisões</h4><p className="whitespace-pre-wrap">{decisions || "—"}</p></div>
      </div>
    );
  }
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await minutesAction(id, { minutes: m, decisions: d }); setMsg(r.ok ? "Ata salva." : r.message ?? "Falha."); if (r.ok) router.refresh(); }); }}>
      <label className="block"><span className={labelCls}>Ata</span><textarea rows={6} maxLength={20000} value={m} onChange={(e) => setM(e.target.value)} className="w-full rounded-lg border border-border bg-bg/45 px-3 py-2 text-sm focus:border-primary focus:outline-none" data-testid="meeting-minutes" /></label>
      <label className="block"><span className={labelCls}>Decisões</span><textarea rows={3} maxLength={10000} value={d} onChange={(e) => setD(e.target.value)} className="w-full rounded-lg border border-border bg-bg/45 px-3 py-2 text-sm focus:border-primary focus:outline-none" /></label>
      <div className="flex items-center gap-3"><Button type="submit" size="sm" loading={pending} data-testid="meeting-minutes-save">Salvar ata</Button>{msg ? <span className="text-xs text-muted" role="status">{msg}</span> : null}</div>
    </form>
  );
}

export function ActionItemForm({ id, people, canTasks, canAgenda }: { id: string; people: Person[]; canTasks: boolean; canAgenda: boolean }) {
  const router = useRouter();
  const purposes = WORK_PURPOSES.filter((p) => (p === "APPOINTMENT" ? canAgenda : canTasks));
  const [purpose, setPurpose] = React.useState<WorkPurpose>(purposes.includes("FORWARD") ? "FORWARD" : (purposes[0] ?? "TASK"));
  const [title, setTitle] = React.useState("");
  const [assigneeId, setAssigneeId] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [key, setKey] = React.useState(newNonce);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  if (!purposes.length) return <p className="text-xs text-muted">Seu perfil não cria tarefas nem compromissos.</p>;
  return (
    <form className="grid gap-2 sm:grid-cols-[140px_1fr_170px_150px_auto]" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await actionItemAction(id, { purpose, title, assigneeId, dueDate, requestKey: key, description: "", priority: "NORMAL", caseId: "", clientId: "" }); if (r.ok) { setTitle(""); setDueDate(""); setKey(newNonce()); setError(null); router.refresh(); } else setError(r.message ?? "Falha."); }); }}>
      <select aria-label="Tipo" value={purpose} onChange={(e) => setPurpose(e.target.value as WorkPurpose)} className={inputCls}>{purposes.map((p) => <option key={p} value={p}>{WORK_PURPOSE_LABEL[p]}</option>)}</select>
      <input aria-label="Encaminhamento" required minLength={3} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="O que precisa ser feito" className={inputCls} data-testid="action-item-title" />
      <select aria-label="Responsável" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={inputCls} data-testid="action-item-assignee"><option value="">Responsável</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <input aria-label="Prazo" type="date" required={purpose === "APPOINTMENT"} value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
      <Button type="submit" loading={pending} data-testid="action-item-submit">Adicionar</Button>
      {error ? <p className="text-sm text-danger sm:col-span-5" role="alert">{error}</p> : null}
    </form>
  );
}
