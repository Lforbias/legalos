"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { createMonitorAction, deleteMonitorAction, setMonitorEnabledAction, setMonitorRecipientsAction, syncDjenAction } from "./actions";

export type MonitorView = { id: string; label: string; oabNumber: string; oabUf: string; enabled: boolean; lastSyncAt: string | null; lastStatus: string | null; lastMessage: string | null; defaultAssigneeId: string | null; defaultTeamId: string | null };
export type RecipientOptions = { members: { id: string; name: string }[]; teams: { id: string; name: string }[] };

export function MonitorList({ items, recipients }: { items: MonitorView[]; recipients: RecipientOptions }) {
  const router = useRouter();
  const [msg, setMsg] = React.useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, start] = React.useTransition();
  if (!items.length) return <p className="text-sm text-slate-600">Nenhuma OAB monitorada.</p>;
  return (
    <div className="space-y-3">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {items.map((m) => (
        <div key={m.id} className="rounded-md border border-slate-200 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-medium">{m.label}</div>
              <div className="text-xs text-slate-600">OAB {m.oabUf} {m.oabNumber}</div>
            </div>
            {m.enabled ? <Badge tone="success">Ativo</Badge> : <Badge tone="warning">Desligado</Badge>}
          </div>
          {m.lastSyncAt ? (
            <p className="mt-2 text-xs text-slate-600">
              Última verificação: {new Date(m.lastSyncAt).toLocaleString("pt-BR")} — {m.lastStatus === "OK" ? "ok" : "falhou"}
              {m.lastMessage ? `: ${m.lastMessage}` : ""}
            </p>
          ) : null}
          <div className="mt-2 max-w-sm">
            <label htmlFor={`rcv-${m.id}`} className="text-xs text-slate-600">Quem recebe as publicações novas</label>
            <Select
              id={`rcv-${m.id}`}
              value={m.defaultAssigneeId ? `u:${m.defaultAssigneeId}` : m.defaultTeamId ? `t:${m.defaultTeamId}` : ""}
              onChange={(e) =>
                start(async () => {
                  const r = await setMonitorRecipientsAction(m.id, e.target.value);
                  setMsg(r.ok ? { tone: "success", text: "Destino das publicações atualizado." } : { tone: "error", text: Object.values(r.fieldErrors ?? {})[0]?.[0] ?? r.message ?? "Não foi possível alterar." });
                  router.refresh();
                })
              }
            >
              <option value="">Ninguém (ficam na Entrada)</option>
              <optgroup label="Membros">
                {recipients.members.map((u) => <option key={u.id} value={`u:${u.id}`}>{u.name}</option>)}
              </optgroup>
              {recipients.teams.length ? (
                <optgroup label="Equipes">
                  {recipients.teams.map((t) => <option key={t.id} value={`t:${t.id}`}>Equipe {t.name}</option>)}
                </optgroup>
              ) : null}
            </Select>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const r = await syncDjenAction(m.id);
                  if (!r.ok || !r.data) setMsg({ tone: "error", text: r.message ?? "Não foi possível consultar o DJEN." });
                  else setMsg({ tone: "success", text: `${r.data.found} publicação(ões) de ${r.data.from} a ${r.data.to}: ${r.data.imported} nova(s) na caixa de entrada, ${r.data.alreadyKnown} já conhecida(s)${r.data.cancelled ? `, ${r.data.cancelled} cancelada(s) ignorada(s)` : ""}.` });
                  router.refresh();
                })
              }
            >
              Verificar agora
            </Button>
            <Button
              variant="secondary"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const r = await setMonitorEnabledAction(m.id, !m.enabled);
                  setMsg(r.ok ? null : { tone: "error", text: r.message ?? "Não foi possível alterar." });
                  router.refresh();
                })
              }
            >
              {m.enabled ? "Desligar" : "Ligar"}
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() => {
                if (!window.confirm("Remover este monitoramento? As intimações já importadas continuam na caixa de entrada.")) return;
                start(async () => {
                  const r = await deleteMonitorAction(m.id);
                  setMsg(r.ok ? null : { tone: "error", text: r.message ?? "Não foi possível remover (exige 2FA ativo)." });
                  router.refresh();
                });
              }}
            >
              Remover
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MonitorForm({ ufs }: { ufs: string[] }) {
  const router = useRouter();
  const [f, setF] = React.useState({ label: "", oabNumber: "", oabUf: "BA" });
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);
  const [pending, start] = React.useTransition();
  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {ok ? <Alert tone="success">OAB cadastrada. Use “Verificar agora” para buscar os últimos 7 dias.</Alert> : null}
      <Field label="Nome (quem é o advogado)" htmlFor="djen-label">
        <Input id="djen-label" value={f.label} onChange={(e) => setF((p) => ({ ...p, label: e.target.value }))} />
      </Field>
      <Field label="Número da OAB" htmlFor="djen-oab">
        <Input id="djen-oab" inputMode="numeric" value={f.oabNumber} onChange={(e) => setF((p) => ({ ...p, oabNumber: e.target.value }))} />
      </Field>
      <Field label="Seccional (UF)" htmlFor="djen-uf">
        <Select id="djen-uf" value={f.oabUf} onChange={(e) => setF((p) => ({ ...p, oabUf: e.target.value }))}>
          {ufs.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </Select>
      </Field>
      <Button
        loading={pending}
        onClick={() =>
          start(async () => {
            setOk(false);
            const r = await createMonitorAction(f);
            if (!r.ok) return setError(Object.values(r.fieldErrors ?? {})[0]?.[0] ?? r.message ?? "Não foi possível cadastrar.");
            setError(null);
            setOk(true);
            setF((p) => ({ ...p, label: "", oabNumber: "" }));
            router.refresh();
          })
        }
      >
        Monitorar esta OAB
      </Button>
    </div>
  );
}
