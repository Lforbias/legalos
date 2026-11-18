"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { adminUpdateMemberAction, updateCoworkSettingsAction, updateMyProfileAction } from "./actions";
import { AVAILABILITY_LABEL, COWORK_DEPARTMENT_LABEL, COWORK_DEPARTMENTS } from "./constants";

const inputCls = "h-10 w-full rounded-lg border border-border bg-bg/45 px-3 text-sm focus:border-primary focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium text-muted";

export function MyProfileForm({ initial }: { initial: { displayName: string; jobTitle: string; availability: string; availabilityNote: string } }) {
  const router = useRouter();
  const [v, setV] = React.useState(initial);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await updateMyProfileAction(v); setMsg(r.ok ? "Perfil salvo." : r.message ?? "Falha."); if (r.ok) router.refresh(); }); }}>
      <label className="block"><span className={labelCls}>Nome de exibição profissional</span><input maxLength={80} value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} className={inputCls} placeholder="Como a equipe vê você" data-testid="profile-display-name" /></label>
      <label className="block"><span className={labelCls}>Cargo</span><input maxLength={80} value={v.jobTitle} onChange={(e) => setV({ ...v, jobTitle: e.target.value })} className={inputCls} placeholder="ex.: Advogada sênior" /></label>
      <label className="block"><span className={labelCls}>Disponibilidade (declarada por você)</span>
        <select value={v.availability} onChange={(e) => setV({ ...v, availability: e.target.value })} className={inputCls}>
          <option value="">Não informar</option>{Object.entries(AVAILABILITY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label className="block"><span className={labelCls}>Observação</span><input maxLength={120} value={v.availabilityNote} onChange={(e) => setV({ ...v, availabilityNote: e.target.value })} className={inputCls} placeholder="ex.: em audiência até 15h" /></label>
      <div className="flex items-center gap-3 sm:col-span-2"><Button type="submit" size="sm" loading={pending}>Salvar perfil</Button>{msg ? <span className="text-xs text-muted" role="status">{msg}</span> : null}</div>
    </form>
  );
}

export function WorkspaceSettingsForm({ initial }: { initial: { enabled: boolean; allowDirect: boolean; defaultChannels: string[] } }) {
  const router = useRouter();
  const [v, setV] = React.useState(initial);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await updateCoworkSettingsAction(v); setMsg(r.ok ? "Configurações salvas." : r.message ?? "Falha."); if (r.ok) router.refresh(); }); }}>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} className="mt-0.5" /><span>Cowork habilitado no escritório<span className="block text-xs text-muted">Desligado, só quem administra o Cowork continua com acesso.</span></span></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={v.allowDirect} onChange={(e) => setV({ ...v, allowDirect: e.target.checked })} className="mt-0.5" /><span>Permitir conversas diretas entre duas pessoas</span></label>
      <fieldset>
        <legend className={labelCls}>Canais departamentais padrão (criados automaticamente)</legend>
        <div className="flex flex-wrap gap-3">
          {COWORK_DEPARTMENTS.map((d) => (
            <label key={d} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={v.defaultChannels.includes(d)} onChange={(e) => setV({ ...v, defaultChannels: e.target.checked ? [...v.defaultChannels, d] : v.defaultChannels.filter((x) => x !== d) })} />{COWORK_DEPARTMENT_LABEL[d]}</label>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">O canal Geral sempre existe. Desmarcar não apaga canais já criados (arquive-os, se quiser).</p>
      </fieldset>
      <div className="flex items-center gap-3"><Button type="submit" size="sm" loading={pending}>Salvar</Button>{msg ? <span className="text-xs text-muted" role="status">{msg}</span> : null}</div>
    </form>
  );
}

export function MemberRow({ m }: { m: { id: string; name: string; displayName: string | null; email: string; roleName: string; hasPermission: boolean; department: string | null; jobTitle: string | null; blocked: boolean } }) {
  const router = useRouter();
  const [dept, setDept] = React.useState(m.department ?? "");
  const [job, setJob] = React.useState(m.jobTitle ?? "");
  const [msg, setMsg] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const save = (input: { department?: string | null; jobTitle?: string | null; blocked?: boolean }) => start(async () => { const r = await adminUpdateMemberAction(m.id, input); setMsg(r.ok ? "Salvo." : r.message ?? "Falha."); if (r.ok) router.refresh(); });
  return (
    <tr className="border-b border-border last:border-0" data-testid="cowork-admin-member">
      <td className="px-4 py-2"><span className="font-medium">{m.displayName || m.name}</span><span className="block text-xs text-muted">{m.email}</span></td>
      <td className="px-3 py-2 text-xs">{m.roleName}{m.hasPermission ? "" : <span className="block text-warning">perfil sem acesso ao Cowork</span>}</td>
      <td className="px-3 py-2"><select aria-label={`Departamento de ${m.name}`} value={dept} onChange={(e) => { setDept(e.target.value); save({ department: e.target.value || null }); }} className="h-8 rounded-md border border-border bg-bg/45 px-2 text-xs"><option value="">Sem departamento</option>{COWORK_DEPARTMENTS.map((d) => <option key={d} value={d}>{COWORK_DEPARTMENT_LABEL[d]}</option>)}</select></td>
      <td className="px-3 py-2"><input aria-label={`Cargo de ${m.name}`} value={job} maxLength={80} onChange={(e) => setJob(e.target.value)} onBlur={() => job !== (m.jobTitle ?? "") && save({ jobTitle: job || null })} className="h-8 w-40 rounded-md border border-border bg-bg/45 px-2 text-xs" /></td>
      <td className="px-3 py-2"><Button size="sm" variant={m.blocked ? "secondary" : "ghost"} loading={pending} onClick={() => save({ blocked: !m.blocked })}>{m.blocked ? "Liberar Cowork" : "Bloquear Cowork"}</Button>{msg ? <span className="ml-2 text-[11px] text-muted">{msg}</span> : null}</td>
    </tr>
  );
}
