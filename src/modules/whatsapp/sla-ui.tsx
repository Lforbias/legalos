"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { saveSlaAction } from "./actions";

export type SlaView = { enabled: boolean; minutes: number; notifyAssignee: boolean; notifyEmail: boolean; escalateUserId: string | null; recent: { id: string; at: string; recipients: number; who: string; conversationId: string }[] };
type Msg = { tone: "error" | "success"; text: string } | null;
const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function SlaPanel({ sla, agents }: { sla: SlaView; agents: { id: string; name: string }[] }) {
  const router = useRouter();
  const [v, setV] = React.useState({ enabled: sla.enabled, minutes: String(sla.minutes), notifyAssignee: sla.notifyAssignee, notifyEmail: sla.notifyEmail, escalateUserId: sla.escalateUserId ?? "" });
  const [msg, setMsg] = React.useState<Msg>(null);
  const [pending, start] = React.useTransition();
  const save = (enabled: boolean) => start(async () => {
    const r = await saveSlaAction({ enabled, minutes: Number(v.minutes), notifyAssignee: v.notifyAssignee, notifyEmail: v.notifyEmail, escalateUserId: v.escalateUserId || null });
    if (r.ok) { setV((x) => ({ ...x, enabled })); setMsg({ tone: "success", text: enabled === sla.enabled ? "Salvo." : enabled ? "SLA ligado." : "SLA desligado." }); }
    else setMsg({ tone: "error", text: (r.fieldErrors ? Object.values(r.fieldErrors).flat().filter(Boolean).join(" ") : "") || r.message || "Não foi possível salvar." });
    router.refresh();
  });
  return (
    <div className="space-y-4" data-testid="sla-panel">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <Alert tone="info">Se o cliente escreveu e ninguém da equipe respondeu no prazo, a qualquer hora, o responsável recebe um aviso aqui no sistema e um e-mail. Isto <strong>não escreve ao cliente</strong>. Quando uma pessoa responde, o alerta some sozinho. Conversas sem resposta há mais de 24 horas não geram alerta.</Alert>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium">Estado:</span>
        <Badge tone={v.enabled ? "success" : "neutral"} data-testid="sla-status">{v.enabled ? "Ligado" : "Desligado"}</Badge>
        {v.enabled
          ? <Button size="sm" variant="secondary" loading={pending} onClick={() => save(false)}>Desligar</Button>
          : <Button size="sm" loading={pending} onClick={() => save(true)}>Ligar</Button>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Avisar se ninguém responder em (minutos)" htmlFor="sla-min"><Input id="sla-min" type="number" min={1} max={1440} value={v.minutes} onChange={(e) => setV({ ...v, minutes: e.target.value })} /></Field>
        <Field label="Pessoa de escalonamento (opcional)" htmlFor="sla-esc">
          <Select id="sla-esc" value={v.escalateUserId} onChange={(e) => setV({ ...v, escalateUserId: e.target.value })}>
            <option value="">Ninguém</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.notifyAssignee} onChange={(e) => setV({ ...v, notifyAssignee: e.target.checked })} /> Avisar o responsável da conversa</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.notifyEmail} onChange={(e) => setV({ ...v, notifyEmail: e.target.checked })} /> Mandar também por e-mail</label>
      <Button loading={pending} onClick={() => save(v.enabled)}>Salvar</Button>
      {sla.recent.length ? (
        <div className="space-y-1 text-sm">
          <div className="text-xs font-medium">Últimos alertas</div>
          <ul className="divide-y divide-border rounded-md border border-border">
            {sla.recent.map((r) => <li key={r.id} className="flex justify-between gap-2 p-2"><span className="truncate">{r.who}</span><span className="shrink-0 text-xs text-muted">{fmt(r.at)} · {r.recipients} avisado(s)</span></li>)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
