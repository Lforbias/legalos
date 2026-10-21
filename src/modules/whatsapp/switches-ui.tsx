"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { billingPreviewAction, setSwitchAction, stopAllMessagingAction } from "./actions";
import type { SwitchesView } from "@/server/services/chat-switches.service";

type Msg = { tone: "error" | "success"; text: string } | null;
type Key = "billing" | "bot" | "away" | "autoAssign" | "automations";
type Row = { key: Key; title: string; desc: string; on: boolean; status: string; warn: string | null; sends: boolean; canTurnOn: boolean; hint?: string };

export function SwitchesPanel({ sw }: { sw: SwitchesView }) {
  const router = useRouter();
  const [msg, setMsg] = React.useState<Msg>(null);
  const [pending, start] = React.useTransition();
  const [confirming, setConfirming] = React.useState<Key | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);

  const rows: Row[] = [
    { key: "billing", title: "Cobrança de honorários pelo WhatsApp", desc: "Envia lembretes de parcela aos clientes (antes, no dia e em atraso).", on: sw.billing.enabled, status: sw.billing.enabled ? "Ligada" : "Desligada", sends: true, canTurnOn: true,
      warn: "Ao ligar, o sistema passa a enviar mensagens de cobrança a clientes reais, nos dias e horários configurados, sem ninguém clicar. Ligue somente com a autorização da Dra. Talita." },
    { key: "bot", title: "Menu de triagem (chatbot)", desc: "Responde a conversa nova com o menu de opções.", on: sw.bot.enabled, status: sw.bot.enabled ? "Ligado" : "Desligado", sends: true, canTurnOn: sw.bot.configured, hint: sw.bot.configured ? undefined : "Monte o menu antes de ligar.",
      warn: "Ao ligar, toda conversa nova ou reaberta receberá o menu automaticamente." },
    { key: "away", title: "Mensagem de ausência", desc: "Responde fora do expediente.", on: sw.away.enabled, status: sw.away.enabled ? "Ligada" : "Desligada", sends: true, canTurnOn: sw.away.configured, hint: sw.away.configured ? undefined : "Escreva a mensagem antes de ligar.",
      warn: "Ao ligar, quem escrever fora do expediente receberá a mensagem de ausência." },
    { key: "automations", title: "Automações do Chat", desc: `${sw.automations.active} de ${sw.automations.total} ligadas. Cada automação também tem o seu botão mais abaixo.`, on: sw.automations.active > 0, status: sw.automations.total === 0 ? "Nenhuma criada" : sw.automations.active > 0 ? `${sw.automations.active} ligada(s)` : "Todas desligadas", sends: true, canTurnOn: sw.automations.total > 0,
      warn: "Ao ligar, todas as automações criadas voltam a funcionar (algumas respondem ao cliente)." },
    { key: "autoAssign", title: "Distribuição automática de conversas", desc: "Escolhe o atendente de cada conversa nova pelas regras da fila. Desligada, as conversas ficam sem responsável até alguém assumir.", on: sw.autoAssign.enabled, status: sw.autoAssign.enabled ? "Ligada" : "Desligada", sends: false, canTurnOn: true, warn: null },
  ];
  const anyOn = rows.some((r) => r.sends && r.on);

  const apply = (key: Key, on: boolean) => start(async () => {
    const r = await setSwitchAction(key, on);
    setMsg(r.ok ? { tone: "success", text: on ? "Ligado." : "Desligado." } : { tone: "error", text: r.message ?? "Não foi possível alterar." });
    setConfirming(null);
    setPreview(null);
    router.refresh();
  });
  const ask = (r: Row) => {
    setConfirming(r.key);
    setPreview(null);
    if (r.key === "billing") start(async () => {
      const p = await billingPreviewAction();
      setPreview(!p.ok || !p.data ? null : !p.data.windowOpenNow ? "Fora do horário/dia de envio configurado: nada seria enviado nesta hora. Os lembretes começam no próximo horário de envio." : `Se ligar agora, a próxima rodada enviaria ${p.data.wouldSend} mensagem(ns) para ${p.data.clients} cliente(s).`);
    });
  };

  return (
    <div className="space-y-3" data-testid="switches-panel">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <Alert tone="info">Nada que envia mensagem sozinho liga por conta própria. Aqui você liga e desliga cada função; todo botão fica registrado na auditoria (quem e quando).</Alert>
      <ul className="divide-y divide-border rounded-md border border-border">
        {rows.map((r) => (
          <li key={r.key} className="space-y-2 p-3 text-sm" data-testid={`switch-${r.key}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium">{r.title} <Badge tone={r.on ? "success" : "neutral"} data-testid={`switch-status-${r.key}`}>{r.status}</Badge></div>
                <div className="text-xs text-muted">{r.desc}</div>
                {r.hint ? <div className="text-xs text-warning">{r.hint}</div> : null}
              </div>
              {r.on ? (
                <Button size="sm" variant="secondary" loading={pending} onClick={() => apply(r.key, false)}>{r.key === "automations" ? "Desligar todas" : "Desligar"}</Button>
              ) : confirming === r.key ? null : (
                <Button size="sm" disabled={!r.canTurnOn || pending} onClick={() => (r.warn ? ask(r) : apply(r.key, true))}>{r.key === "automations" ? "Ligar todas" : "Ligar"}</Button>
              )}
            </div>
            {confirming === r.key && r.warn ? (
              <div className="space-y-2 rounded-md border border-warning/40 bg-warning-bg p-3 text-warning" data-testid={`switch-confirm-${r.key}`}>
                <p>{r.warn}</p>
                {r.key === "billing" && preview ? <p className="font-medium" data-testid="switch-preview">{preview}</p> : null}
                <div className="flex gap-2">
                  <Button size="sm" loading={pending} onClick={() => apply(r.key, true)}>Confirmo, ligar</Button>
                  <Button size="sm" variant="secondary" onClick={() => { setConfirming(null); setPreview(null); }}>Cancelar</Button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {anyOn ? (
        <Button variant="danger" loading={pending} onClick={() => start(async () => {
          const r = await stopAllMessagingAction();
          setMsg(r.ok ? { tone: "success", text: "Tudo o que envia mensagem sozinho foi desligado." } : { tone: "error", text: r.message ?? "Não foi possível desligar." });
          router.refresh();
        })}>Desligar tudo o que envia mensagem sozinho</Button>
      ) : null}
    </div>
  );
}
