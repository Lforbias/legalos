"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import type { AnnouncementPreview } from "@/server/services/announcement.service";
import { previewAnnouncementAction, sendAnnouncementAction } from "./developer-actions";

type Msg = { tone: "error" | "success"; text: string } | null;
const errText = (r: { message?: string; fieldErrors?: Record<string, string[] | undefined> }) => (r.fieldErrors ? Object.values(r.fieldErrors).flat().filter(Boolean).join(" ") : "") || r.message || "Não foi possível concluir.";

export function AnnouncementForm({ orgs }: { orgs: { id: string; name: string }[] }) {
  const router = useRouter();
  const [v, setV] = React.useState({ kind: "INFO", title: "", body: "", link: "", audience: "ALL", organizationId: "", userEmail: "", viaInApp: true, viaPush: true });
  const [preview, setPreview] = React.useState<AnnouncementPreview | null>(null);
  const [msg, setMsg] = React.useState<Msg>(null);
  const [pending, start] = React.useTransition();
  const input = { ...v, link: v.link || undefined, organizationId: v.audience === "ORG" ? v.organizationId || null : null, userEmail: v.audience === "USER" ? v.userEmail || null : null };
  const change = (patch: Partial<typeof v>) => { setV((x) => ({ ...x, ...patch })); setPreview(null); setMsg(null); };

  const check = () => start(async () => {
    setMsg(null);
    const r = await previewAnnouncementAction(input);
    if (r.ok && r.data) setPreview(r.data);
    else { setPreview(null); setMsg({ tone: "error", text: errText(r) }); }
  });
  const send = () => start(async () => {
    if (!preview) return;
    const r = await sendAnnouncementAction(input, preview.recipients);
    if (r.ok && r.data) {
      setMsg({ tone: "success", text: `Enviado a ${r.data.recipients} pessoa(s): ${r.data.inApp} no sistema, ${r.data.pushSent} no celular${r.data.pushFailed ? ` (${r.data.pushFailed} aparelho(s) recusaram)` : ""}.` });
      setPreview(null);
      setV((x) => ({ ...x, title: "", body: "", link: "" }));
    } else setMsg({ tone: "error", text: errText(r) });
    router.refresh();
  });

  return (
    <div className="space-y-4" data-testid="announcement-form">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <Alert tone="warning">Escreva um texto geral. <strong>Não coloque nome de cliente, número de processo ou dados pessoais</strong>: a mensagem passa pelo serviço de avisos do Google, da Apple e da Mozilla.</Alert>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Tipo" htmlFor="ann-kind"><Select id="ann-kind" value={v.kind} onChange={(e) => change({ kind: e.target.value })}><option value="INFO">Novidade</option><option value="MAINTENANCE">Manutenção</option><option value="ALERT">Alerta</option></Select></Field>
        <Field label="Para quem" htmlFor="ann-aud"><Select id="ann-aud" value={v.audience} onChange={(e) => change({ audience: e.target.value })}><option value="ALL">Todos os escritórios</option><option value="ORG">Um escritório</option><option value="USER">Uma pessoa</option></Select></Field>
        {v.audience === "ORG" ? <Field label="Escritório" htmlFor="ann-org"><Select id="ann-org" value={v.organizationId} onChange={(e) => change({ organizationId: e.target.value })}><option value="">Escolha…</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field> : null}
        {v.audience === "USER" ? <Field label="E-mail da pessoa" htmlFor="ann-email"><Input id="ann-email" type="email" value={v.userEmail} onChange={(e) => change({ userEmail: e.target.value })} /></Field> : null}
      </div>
      <Field label="Título (até 80 caracteres)" htmlFor="ann-title"><Input id="ann-title" maxLength={80} value={v.title} onChange={(e) => change({ title: e.target.value })} /></Field>
      <Field label="Mensagem (até 400 caracteres; no celular aparece o começo)" htmlFor="ann-body"><Textarea id="ann-body" rows={3} maxLength={400} value={v.body} onChange={(e) => change({ body: e.target.value })} /></Field>
      <Field label="Link ao tocar (opcional, caminho do sistema, como /prazos)" htmlFor="ann-link"><Input id="ann-link" value={v.link} onChange={(e) => change({ link: e.target.value })} placeholder="/notificacoes" /></Field>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={v.viaInApp} onChange={(e) => change({ viaInApp: e.target.checked })} /> Aviso no sistema (sino)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={v.viaPush} onChange={(e) => change({ viaPush: e.target.checked })} /> Aviso no celular</label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" loading={pending} onClick={check} data-testid="ann-check">Conferir quem recebe</Button>
        {preview ? (
          <>
            <span className="text-sm" data-testid="ann-preview">{preview.recipients} pessoa(s){v.viaPush ? `, ${preview.devices} aparelho(s) com aviso ativado` : ""}.{v.viaPush && !preview.pushConfigured ? " Chaves de aviso não configuradas no servidor." : ""}</span>
            <Button loading={pending} onClick={send} data-testid="ann-send">Enviar para {preview.recipients}</Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
