"use client";

import { Check, Hash, Lock, UserMinus } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addMembersAction, convertMessageAction, createChannelAction, createGroupAction, joinChannelAction, openDirectAction, removeMemberAction } from "./actions";
import { COWORK_DEPARTMENT_LABEL, COWORK_DEPARTMENTS, WORK_PURPOSE_LABEL, WORK_PURPOSES, type WorkPurpose } from "./constants";
import { SharePicker } from "./composer";
import type { CoworkMessageDTO, CoworkPerms, Person } from "./types";
import { fetchJson, Modal, newNonce, PersonAvatar } from "./ui";

const inputCls = "h-10 w-full rounded-lg border border-border bg-bg/45 px-3 text-sm focus:border-primary focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium text-muted";

export function PeoplePicker({ people, selected, onChange, exclude = [], max }: { people: Person[]; selected: string[]; onChange: (ids: string[]) => void; exclude?: string[]; max?: number }) {
  const [q, setQ] = React.useState("");
  const list = people.filter((p) => !exclude.includes(p.id) && p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pessoa" aria-label="Buscar pessoa" className={inputCls} />
      <ul className="mt-2 max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {list.length === 0 ? <li className="px-3 py-4 text-center text-xs text-muted">Ninguém encontrado.</li> : null}
        {list.map((p) => {
          const on = selected.includes(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onChange(on ? selected.filter((x) => x !== p.id) : max && selected.length >= max ? selected : [...selected, p.id])}
                className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-2", on && "bg-primary/5")}
                data-testid="cowork-person-option"
              >
                <PersonAvatar id={p.id} name={p.name} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{p.name}</span>
                  <span className="block truncate text-[11px] text-muted">{[p.jobTitle, p.departmentLabel, p.roleName].filter(Boolean).join(" · ")}</span>
                </span>
                {on ? <Check className="h-4 w-4 text-primary-text" aria-hidden /> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function NewChannelDialog({ people, meId, perms, onClose, onCreated }: { people: Person[]; meId: string; perms: CoworkPerms; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = React.useState("");
  const [topic, setTopic] = React.useState("");
  const [visibility, setVisibility] = React.useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [department, setDepartment] = React.useState("");
  const [members, setMembers] = React.useState<string[]>([]);
  const [caseRef, setCaseRef] = React.useState<{ id: string; title: string } | null>(null);
  const [pickCase, setPickCase] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <Modal title="Novo canal" onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await createChannelAction({ name, topic, visibility, department: department || null, caseId: caseRef?.id ?? "", memberIds: members });
            if (r.ok && r.data) onCreated(r.data.id);
            else setError(r.message ?? "Não foi possível criar o canal.");
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>Nome</span>
            <input required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="ex.: Audiências da semana" data-testid="cowork-channel-name" />
          </label>
          <label className="block">
            <span className={labelCls}>Departamento (opcional)</span>
            <select value={department} onChange={(e) => setDepartment(e.target.value)} className={inputCls}>
              <option value="">Sem departamento</option>
              {COWORK_DEPARTMENTS.map((d) => <option key={d} value={d}>{COWORK_DEPARTMENT_LABEL[d]}</option>)}
            </select>
          </label>
        </div>
        <label className="block">
          <span className={labelCls}>Assunto (opcional)</span>
          <input maxLength={200} value={topic} onChange={(e) => setTopic(e.target.value)} className={inputCls} />
        </label>
        <fieldset>
          <legend className={labelCls}>Quem pode ver</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["PUBLIC", "PRIVATE"] as const).map((v) => (
              <label key={v} className={cn("flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm", visibility === v && !caseRef ? "border-primary bg-primary/5" : "border-border", caseRef && "opacity-60")}>
                <input type="radio" name="visibility" value={v} checked={caseRef ? v === "PRIVATE" : visibility === v} disabled={Boolean(caseRef)} onChange={() => setVisibility(v)} className="mt-0.5" />
                <span>
                  <span className="flex items-center gap-1 font-medium">{v === "PUBLIC" ? <Hash className="h-3.5 w-3.5" aria-hidden /> : <Lock className="h-3.5 w-3.5" aria-hidden />}{v === "PUBLIC" ? "Público no escritório" : "Privado"}</span>
                  <span className="block text-xs text-muted">{v === "PUBLIC" ? "Qualquer pessoa do Cowork pode encontrar e entrar." : "Só quem for adicionado vê o canal e o histórico."}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {perms.casesRead ? (
          <div>
            <span className={labelCls}>Sala de processo ou projeto (opcional)</span>
            {caseRef ? (
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span className="truncate">{caseRef.title}</span>
                <button type="button" className="text-xs text-muted underline" onClick={() => setCaseRef(null)}>Remover</button>
              </div>
            ) : (
              <button type="button" className="text-xs font-medium text-accent-text underline" onClick={() => setPickCase(true)}>Vincular a um processo</button>
            )}
            <p className="mt-1 text-[11px] text-muted">Salas de processo são privadas e só admitem quem enxerga o processo (sigilo).</p>
          </div>
        ) : null}
        <div>
          <span className={labelCls}>Participantes iniciais</span>
          <PeoplePicker people={people} selected={members} onChange={setMembers} exclude={[meId]} />
        </div>
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={pending} data-testid="cowork-channel-create">Criar canal</Button>
        </div>
      </form>
      {pickCase ? <SharePicker kinds={["CASE"]} onClose={() => setPickCase(false)} onPick={(r) => { setCaseRef({ id: r.resourceId, title: r.title }); setPickCase(false); }} /> : null}
    </Modal>
  );
}

export function NewConversationDialog({ people, meId, perms, onClose, onOpened }: { people: Person[]; meId: string; perms: CoworkPerms; onClose: () => void; onOpened: (id: string) => void }) {
  const [selected, setSelected] = React.useState<string[]>([]);
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const group = selected.length > 1;
  return (
    <Modal title="Nova conversa" onClose={onClose}>
      <p className="mb-3 text-xs text-muted">Escolha uma pessoa para conversa direta, ou várias para um grupo privado.{perms.allowDirect ? "" : " As conversas diretas estão desativadas neste escritório; use grupos."}</p>
      <PeoplePicker people={people} selected={selected} onChange={setSelected} exclude={[meId]} max={30} />
      {group ? (
        <label className="mt-3 block">
          <span className={labelCls}>Nome do grupo (opcional)</span>
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </label>
      ) : null}
      {error ? <p className="mt-2 text-sm text-danger" role="alert">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button
          loading={pending}
          disabled={!selected.length || (!group && !perms.allowDirect)}
          data-testid="cowork-open-conversation"
          onClick={() =>
            start(async () => {
              const r = group ? await createGroupAction({ name, memberIds: selected }) : await openDirectAction(selected[0]!);
              if (r.ok && r.data) onOpened(r.data.id);
              else setError(r.message ?? "Não foi possível abrir a conversa.");
            })
          }
        >
          {group ? "Criar grupo" : "Abrir conversa"}
        </Button>
      </div>
    </Modal>
  );
}

export function ExploreDialog({ onClose, onJoined }: { onClose: () => void; onJoined: (id: string) => void }) {
  const [rows, setRows] = React.useState<{ id: string; name: string; topic: string | null; department: string | null; memberCount: number }[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  React.useEffect(() => {
    fetchJson<{ channels: NonNullable<typeof rows> }>("/api/cowork/channels?joinable=1").then((d) => setRows(d.channels), (e: Error) => setError(e.message));
  }, []);
  return (
    <Modal title="Explorar canais públicos" onClose={onClose}>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {!rows ? <p className="py-6 text-center text-sm text-muted">Carregando…</p> : rows.length === 0 ? <p className="py-6 text-center text-sm text-muted">Você já participa de todos os canais públicos.</p> : null}
      <ul className="divide-y divide-border">
        {rows?.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-sm font-medium"><Hash className="h-3.5 w-3.5 text-muted" aria-hidden />{c.name}</span>
              <span className="block truncate text-xs text-muted">{[c.topic, `${c.memberCount} participante(s)`].filter(Boolean).join(" · ")}</span>
            </span>
            <Button size="sm" variant="secondary" loading={pending} onClick={() => start(async () => { const r = await joinChannelAction(c.id); if (r.ok) onJoined(c.id); else setError(r.message ?? "Não foi possível entrar."); })}>
              Entrar
            </Button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function MembersDialog({ channelId, canManage, people, onClose, onChanged }: { channelId: string; canManage: boolean; people: Person[]; onClose: () => void; onChanged: () => void }) {
  const [members, setMembers] = React.useState<{ userId: string; role: string; name: string }[] | null>(null);
  const [adding, setAdding] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const load = React.useCallback(() => fetchJson<{ members: NonNullable<typeof members> }>(`/api/cowork/channels/${channelId}/members`).then((d) => setMembers(d.members), (e: Error) => setError(e.message)), [channelId]);
  React.useEffect(() => void load(), [load]);
  return (
    <Modal title="Participantes" onClose={onClose}>
      <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {members?.map((m) => (
          <li key={m.userId} className="flex items-center gap-2.5 px-3 py-2">
            <PersonAvatar id={m.userId} name={m.name} size={26} />
            <span className="flex-1 truncate text-sm">{m.name}</span>
            {m.role !== "MEMBER" ? <span className="text-[11px] text-muted">{m.role === "OWNER" ? "Criador(a)" : "Administra"}</span> : null}
            {canManage ? (
              <button type="button" aria-label={`Remover ${m.name}`} className="rounded p-1 text-muted hover:bg-danger-bg hover:text-danger" onClick={() => start(async () => { const r = await removeMemberAction(channelId, m.userId); if (r.ok) { await load(); onChanged(); } else setError(r.message ?? "Falha."); })}>
                <UserMinus className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {canManage ? (
        <div className="mt-4">
          <span className={labelCls}>Adicionar pessoas</span>
          <PeoplePicker people={people} selected={adding} onChange={setAdding} exclude={members?.map((m) => m.userId) ?? []} />
          <div className="mt-3 flex justify-end">
            <Button size="sm" disabled={!adding.length} loading={pending} onClick={() => start(async () => { const r = await addMembersAction(channelId, adding); if (r.ok) { setAdding([]); await load(); onChanged(); } else setError(r.message ?? "Falha."); })}>
              Adicionar
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-danger" role="alert">{error}</p> : null}
    </Modal>
  );
}

/** Mensagem → tarefa, atividade, encaminhamento, revisão, pendência ou compromisso (nos módulos originais). */
export function ConvertDialog({ message, people, perms, onClose, onDone }: { message: CoworkMessageDTO; people: Person[]; perms: CoworkPerms; onClose: () => void; onDone: (text: string) => void }) {
  const purposes = WORK_PURPOSES.filter((p) => (p === "APPOINTMENT" ? perms.agendaWrite : perms.tasksWrite));
  const [purpose, setPurpose] = React.useState<WorkPurpose>(purposes[0] ?? "TASK");
  const [title, setTitle] = React.useState(message.body.split("\n")[0]?.slice(0, 120) || "Tarefa do Cowork");
  const [description, setDescription] = React.useState(message.body);
  const [assigneeId, setAssigneeId] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [startTime, setStartTime] = React.useState("");
  const [endTime, setEndTime] = React.useState("");
  const [priority, setPriority] = React.useState("NORMAL");
  const [caseRef, setCaseRef] = React.useState<{ id: string; title: string } | null>(null);
  const [pickCase, setPickCase] = React.useState(false);
  const [requestKey] = React.useState(newNonce);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  if (!purposes.length) {
    return (
      <Modal title="Transformar em trabalho" onClose={onClose}>
        <p className="text-sm text-muted">Seu perfil não pode criar tarefas nem compromissos. Peça a quem administra o escritório.</p>
      </Modal>
    );
  }
  return (
    <Modal title="Transformar mensagem em trabalho" onClose={onClose} wide>
      <p className="mb-3 text-xs text-muted">O registro é criado no módulo original ({purpose === "APPOINTMENT" ? "Agenda" : "Tarefas"}), com responsável, prazo e histórico. A conversa guarda só o vínculo.</p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await convertMessageAction(message.id, { purpose, title, description, assigneeId, dueDate, priority, caseId: caseRef?.id ?? "", clientId: "", startTime, endTime, requestKey });
            if (r.ok) onDone(purpose === "APPOINTMENT" ? "Compromisso criado na agenda." : `${WORK_PURPOSE_LABEL[purpose]} criada no módulo de tarefas.`);
            else setError(r.message ?? "Não foi possível criar.");
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>Tipo</span>
            <select value={purpose} onChange={(e) => setPurpose(e.target.value as WorkPurpose)} className={inputCls} data-testid="cowork-convert-purpose">
              {purposes.map((p) => <option key={p} value={p}>{WORK_PURPOSE_LABEL[p]}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Responsável</span>
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={inputCls} data-testid="cowork-convert-assignee">
              <option value="">Sem responsável</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
        <label className="block">
          <span className={labelCls}>Título</span>
          <input required minLength={3} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} data-testid="cowork-convert-title" />
        </label>
        <label className="block">
          <span className={labelCls}>Descrição</span>
          <textarea rows={3} maxLength={3500} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border border-border bg-bg/45 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className={labelCls}>{purpose === "APPOINTMENT" ? "Data" : "Prazo"}</span>
            <input type="date" value={dueDate} required={purpose === "APPOINTMENT"} onChange={(e) => setDueDate(e.target.value)} className={inputCls} data-testid="cowork-convert-due" />
          </label>
          {purpose === "APPOINTMENT" ? (
            <>
              <label className="block"><span className={labelCls}>Início</span><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} /></label>
              <label className="block"><span className={labelCls}>Término</span><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} /></label>
            </>
          ) : (
            <label className="block">
              <span className={labelCls}>Prioridade</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputCls}>
                <option value="LOW">Baixa</option><option value="NORMAL">Normal</option><option value="HIGH">Alta</option><option value="URGENT">Urgente</option>
              </select>
            </label>
          )}
        </div>
        {perms.casesRead ? (
          <div className="text-sm">
            {caseRef ? (
              <span className="flex items-center justify-between rounded-lg border border-border px-3 py-2"><span className="truncate">Processo: {caseRef.title}</span><button type="button" className="text-xs underline" onClick={() => setCaseRef(null)}>Remover</button></span>
            ) : (
              <button type="button" className="text-xs font-medium text-accent-text underline" onClick={() => setPickCase(true)}>Vincular a um processo</button>
            )}
          </div>
        ) : null}
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={pending} data-testid="cowork-convert-submit">Criar</Button>
        </div>
      </form>
      {pickCase ? <SharePicker kinds={["CASE"]} onClose={() => setPickCase(false)} onPick={(r) => { setCaseRef({ id: r.resourceId, title: r.title }); setPickCase(false); }} /> : null}
    </Modal>
  );
}
