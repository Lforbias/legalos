"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { TASK_STATUSES, TASK_STATUS_LABEL } from "./schemas";
import { saveStageAction } from "./stage-actions";
type Stage = { id: string; name: string; status: typeof TASK_STATUSES[number]; position: number; active: boolean };
export function StageEditor({ stage }: { stage?: Stage }) {
  const router = useRouter();
  const [name, setName] = useState(stage?.name ?? "Aguardando protocolo");
  const [status, setStatus] = useState<Stage["status"]>(stage?.status ?? "WAITING");
  const [position, setPosition] = useState(stage?.position ?? 0);
  const [active, setActive] = useState(stage?.active ?? true);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return <form className="flex flex-wrap items-end gap-3 rounded border border-border p-4" onSubmit={e => { e.preventDefault(); start(async () => {
    const res = await saveStageAction(stage?.id ?? null, { name, status, position, active });
    setMessage(res.ok ? "Salvo." : res.message ?? "Não foi possível salvar.");
    if (res.ok) router.refresh();
  }); }}>
    <label className="text-sm">Nome<Input required maxLength={60} value={name} onChange={e => setName(e.target.value)} /></label>
    <label className="text-sm">Status-base<Select disabled={!!stage} value={status} onChange={e => setStatus(e.target.value as Stage["status"])}>{TASK_STATUSES.map(s => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}</Select></label>
    <label className="text-sm">Ordem<Input type="number" min={0} max={999} value={position} onChange={e => setPosition(Number(e.target.value))} className="w-20" /></label>
    <label className="text-sm"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Ativa</label>
    <Button loading={pending} type="submit">{stage ? "Salvar" : "Criar etapa"}</Button>
    {message ? <Alert tone={message === "Salvo." ? "success" : "error"}>{message}</Alert> : null}
  </form>;
}
