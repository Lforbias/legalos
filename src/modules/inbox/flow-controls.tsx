"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Input, Select } from "@/components/ui/form";
import type { ActionState } from "@/lib/validation/common";
import { addNoteAction, assignTeamAction, createTeamAction, deleteNoteAction, deleteTeamAction, returnNoticeAction, setTeamMembersAction, snoozeAction, tagsAction, toEntradaAction } from "./flow-actions";

function useRun() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const run = (fn: () => Promise<ActionState<unknown>>, after?: () => void) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(Object.values(res.fieldErrors ?? {})[0]?.[0] ?? res.message ?? "Não foi possível concluir a operação.");
      else after?.();
      router.refresh();
    });
  };
  return { run, pending, error };
}

export function TeamAssignControl({ id, teams, current }: { id: string; teams: { id: string; name: string }[]; current: string }) {
  const { run, pending, error } = useRun();
  const [value, setValue] = React.useState(current);
  if (!teams.length) return <p className="text-xs text-muted">Nenhuma equipe criada ainda.</p>;
  return (
    <div className="space-y-2">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <label htmlFor="assign-team" className="sr-only">Equipe</label>
      <Select id="assign-team" value={value} disabled={pending} onChange={(e) => setValue(e.target.value)}>
        <option value="">Selecione…</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </Select>
      <Button size="sm" variant="secondary" disabled={!value || value === current} loading={pending} onClick={() => run(() => assignTeamAction(id, value))}>Enviar à equipe</Button>
    </div>
  );
}

export function FlowButtons({ id, status, canReturn, snoozedUntil, today }: { id: string; status: string; canReturn: boolean; snoozedUntil: string | null; today: string }) {
  const { run, pending, error } = useRun();
  const [until, setUntil] = React.useState("");
  const open = status === "NEW" || status === "DISTRIBUTED";
  const asleep = Boolean(snoozedUntil && snoozedUntil > today);
  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {asleep ? <Alert tone="info">Adormecida até {snoozedUntil!.split("-").reverse().join("/")}.</Alert> : null}
      {canReturn ? <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => returnNoticeAction(id))}>Devolver a quem encarregou</Button> : null}
      {status !== "DISCARDED" && !(status === "NEW" && !asleep) ? <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => toEntradaAction(id))}>Enviar à Entrada</Button> : null}
      {open ? (
        <div className="space-y-2">
          <label htmlFor="snooze-date" className="block text-xs text-muted">Adormecer até</label>
          <Input id="snooze-date" type="date" value={until} min={today} onChange={(e) => setUntil(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={!until} loading={pending} onClick={() => run(() => snoozeAction(id, until), () => setUntil(""))}>Adormecer</Button>
            {asleep ? <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => snoozeAction(id, null))}>Acordar agora</Button> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TagsEditor({ id, tags, canWrite }: { id: string; tags: string[]; canWrite: boolean }) {
  const { run, pending, error } = useRun();
  const [text, setText] = React.useState(tags.join(", "));
  if (!canWrite) return <p className="text-sm">{tags.length ? tags.join(", ") : "—"}</p>;
  return (
    <div className="space-y-2">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <label htmlFor="tags" className="sr-only">Etiquetas</label>
      <Input id="tags" value={text} onChange={(e) => setText(e.target.value)} placeholder="urgente, audiência, cliente vip" />
      <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => tagsAction(id, text.split(",")))}>Salvar etiquetas</Button>
    </div>
  );
}

export function NotesPanel({ id, notes, canWrite, myId, isOwner, fmt }: { id: string; notes: { id: string; body: string; authorId: string; authorName: string; createdAt: string }[]; canWrite: boolean; myId: string; isOwner: boolean; fmt: string[] }) {
  const { run, pending, error } = useRun();
  const [body, setBody] = React.useState("");
  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {notes.length === 0 ? <p className="text-sm text-muted">Nenhuma nota interna.</p> : null}
      <ul className="space-y-2">
        {notes.map((n, i) => (
          <li key={n.id} className="rounded-md border border-border p-2 text-sm">
            <p className="whitespace-pre-wrap">{n.body}</p>
            <p className="mt-1 flex items-center justify-between text-xs text-muted">
              <span>{n.authorName} · {fmt[i]}</span>
              {canWrite && (n.authorId === myId || isOwner) ? (
                <button type="button" className="underline" disabled={pending} onClick={() => run(() => deleteNoteAction(id, n.id))}>Apagar</button>
              ) : null}
            </p>
          </li>
        ))}
      </ul>
      {canWrite ? (
        <div className="space-y-2">
          <label htmlFor="note-body" className="sr-only">Nova nota</label>
          <textarea id="note-body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={2000} placeholder="Orientações e lembretes internos (o cliente não vê)" className="w-full rounded-md border border-border bg-surface p-2 text-sm" />
          <Button size="sm" variant="secondary" disabled={!body.trim()} loading={pending} onClick={() => run(() => addNoteAction(id, body), () => setBody(""))}>Adicionar nota</Button>
        </div>
      ) : null}
    </div>
  );
}

export function TeamsManager({ teams, members }: { teams: { id: string; name: string; members: { id: string }[] }[]; members: { id: string; name: string }[] }) {
  const { run, pending, error } = useRun();
  const [name, setName] = React.useState("");
  const [sel, setSel] = React.useState<Record<string, string[]>>(() => Object.fromEntries(teams.map((t) => [t.id, t.members.map((m) => m.id)])));
  const [newSel, setNewSel] = React.useState<string[]>([]);
  const toggle = (list: string[], uid: string) => (list.includes(uid) ? list.filter((x) => x !== uid) : [...list, uid]);
  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {teams.map((t) => (
        <fieldset key={t.id} className="rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">{t.name}</legend>
          <div className="flex flex-wrap gap-3 text-sm">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-1.5">
                <input type="checkbox" checked={(sel[t.id] ?? []).includes(m.id)} onChange={() => setSel((p) => ({ ...p, [t.id]: toggle(p[t.id] ?? [], m.id) }))} /> {m.name}
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => setTeamMembersAction(t.id, sel[t.id] ?? []))}>Salvar membros</Button>
            <ConfirmAction label="Excluir equipe" confirmLabel="Sim, excluir" description="As intimações da equipe voltam para a Entrada." action={() => deleteTeamAction(t.id)} />
          </div>
        </fieldset>
      ))}
      <div className="rounded-md border border-dashed border-border p-3">
        <label htmlFor="team-name" className="mb-1 block text-sm font-medium">Nova equipe</label>
        <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Trabalhista" />
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          {members.map((m) => (
            <label key={m.id} className="flex items-center gap-1.5">
              <input type="checkbox" checked={newSel.includes(m.id)} onChange={() => setNewSel((p) => toggle(p, m.id))} /> {m.name}
            </label>
          ))}
        </div>
        <Button className="mt-3" size="sm" loading={pending} onClick={() => run(() => createTeamAction({ name, memberIds: newSel }), () => { setName(""); setNewSel([]); })}>Criar equipe</Button>
      </div>
    </div>
  );
}
