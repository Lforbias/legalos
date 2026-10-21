"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { createWebhookAction, deleteWebhookAction, retryDeliveryAction, setWebhookEnabledAction, testWebhookAction } from "./actions";

export type WebhookView = { id: string; name: string; url: string; events: string[]; enabled: boolean; disabledReason: string | null; lastSuccessAt: string | null };
export type DeliveryView = { id: string; endpoint: string; eventType: string; status: "PENDING" | "SUCCEEDED" | "FAILED"; attempts: number; lastStatusCode: number | null; lastError: string | null; createdAt: string };

const DELIVERY = { PENDING: ["warning", "Pendente"], SUCCEEDED: ["success", "Entregue"], FAILED: ["warning", "Falhou"] } as const;

export function WebhookList({ items, deliveries, eventLabels }: { items: WebhookView[]; deliveries: DeliveryView[]; eventLabels: Record<string, string> }) {
  const router = useRouter();
  const [msg, setMsg] = React.useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <div className="space-y-3">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {items.length === 0 ? <p className="text-sm text-slate-600">Nenhum webhook cadastrado.</p> : null}
      {items.map((w) => (
        <div key={w.id} className="rounded-md border border-slate-200 p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium">{w.name}</div>
              <div className="break-all text-xs text-slate-600">{w.url}</div>
              <div className="text-xs text-slate-600">{w.events.map((e) => eventLabels[e] ?? e).join(", ")}</div>
            </div>
            {w.enabled ? <Badge tone="success">Ativo</Badge> : <Badge tone="warning">Desligado</Badge>}
          </div>
          {w.disabledReason && !w.enabled ? <p className="mt-2 text-xs text-slate-600">{w.disabledReason}</p> : null}
          <p className="mt-2 text-xs text-slate-600">{w.lastSuccessAt ? `Última entrega ok: ${new Date(w.lastSuccessAt).toLocaleString("pt-BR")}` : "Ainda sem entrega bem-sucedida."}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const r = await testWebhookAction(w.id);
                  if (!r.ok || !r.data) setMsg({ tone: "error", text: r.message ?? "Não foi possível enviar o teste." });
                  else setMsg(r.data.ok ? { tone: "success", text: `Teste entregue (HTTP ${r.data.statusCode}).` } : { tone: "error", text: `Teste falhou: ${r.data.error ?? "sem detalhe"}` });
                  router.refresh();
                })
              }
            >
              Enviar teste
            </Button>
            <Button
              variant="secondary"
              loading={pending}
              onClick={() =>
                start(async () => {
                  const r = await setWebhookEnabledAction(w.id, !w.enabled);
                  setMsg(r.ok ? null : { tone: "error", text: r.message ?? "Não foi possível alterar." });
                  router.refresh();
                })
              }
            >
              {w.enabled ? "Desligar" : "Ligar"}
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() => {
                if (!window.confirm("Remover este webhook? Entregas pendentes serão canceladas.")) return;
                start(async () => {
                  const r = await deleteWebhookAction(w.id);
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
      {deliveries.length ? (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase text-slate-500">Últimas entregas</h3>
          <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 text-xs">
            {deliveries.map((d) => {
              const [tone, label] = DELIVERY[d.status];
              return (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
                  <span>
                    {new Date(d.createdAt).toLocaleString("pt-BR")} · {d.endpoint} · {eventLabels[d.eventType] ?? d.eventType}
                    {d.lastError ? ` — ${d.lastError}` : ""}
                    {d.attempts ? ` (${d.attempts} tentativa${d.attempts > 1 ? "s" : ""})` : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={tone}>{label}</Badge>
                    {d.status === "FAILED" ? (
                      <Button
                        variant="secondary"
                        loading={pending}
                        onClick={() =>
                          start(async () => {
                            const r = await retryDeliveryAction(d.id);
                            setMsg(r.ok ? null : { tone: "error", text: r.message ?? "Não foi possível reenviar." });
                            router.refresh();
                          })
                        }
                      >
                        Reenviar
                      </Button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function WebhookForm({ events }: { events: { key: string; label: string }[] }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [picked, setPicked] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [secret, setSecret] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  return (
    <div className="space-y-3">
      {secret ? (
        <Alert tone="success">
          <p className="font-medium">Webhook criado. Copie o segredo de assinatura agora: ele não será mostrado de novo.</p>
          <code data-testid="new-webhook-secret" className="mt-2 block break-all rounded bg-white p-2 text-xs text-slate-900">{secret}</code>
        </Alert>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Field label="Nome (para que serve)" htmlFor="wh-name">
        <Input id="wh-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Endereço que receberá os avisos (https://…)" htmlFor="wh-url">
        <Input id="wh-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://exemplo.com.br/legalos" />
      </Field>
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Eventos</legend>
        {events.map((ev) => (
          <label key={ev.key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={picked.includes(ev.key)} onChange={() => toggle(ev.key)} />
            {ev.label}
          </label>
        ))}
      </fieldset>
      <Button
        loading={pending}
        onClick={() =>
          start(async () => {
            setSecret(null);
            const r = await createWebhookAction({ name, url, events: picked });
            if (!r.ok || !r.data) return setError(Object.values(r.fieldErrors ?? {})[0]?.[0] ?? r.message ?? "Não foi possível criar o webhook.");
            setError(null);
            setSecret(r.data.secret);
            setName("");
            setUrl("");
            setPicked([]);
            router.refresh();
          })
        }
      >
        Criar webhook
      </Button>
    </div>
  );
}
