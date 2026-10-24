"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { labelStyle } from "./label-style";
import { deleteFieldAction, deleteLabelAction, deleteQueueAction, distributePendingAction, saveFieldAction, saveLabelAction, saveQueueAction } from "./actions";
import { connectAction, connectQrAction, deleteQuickReplyAction, qrDisconnectAction, qrRestartAction, qrStatusAction, removeAccountAction, saveQuickReplyAction, setEnabledAction, syncTemplatesAction, updateSettingsAction } from "./actions";

type Msg = { tone: "error" | "success"; text: string } | null;

function errText(r: { message?: string; fieldErrors?: Record<string, string[] | undefined> }, fallback: string): string {
  const fields = r.fieldErrors ? Object.values(r.fieldErrors).flat().filter(Boolean).join(" ") : "";
  if (r.message && r.message !== "Corrija os campos destacados.") return r.message;
  return fields || r.message || fallback;
}

export function ConnectForm({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [v, setV] = React.useState({ label: "Atendimento", phoneNumberId: "", wabaId: "", token: "" });
  const [msg, setMsg] = React.useState<Msg>(null);
  const [pending, start] = React.useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await connectAction({ ...v, wabaId: v.wabaId || null });
          if (!r.ok) setMsg({ tone: "error", text: errText(r, "Não foi possível conectar.") });
          else {
            setMsg({ tone: "success", text: `Conectado${r.data?.displayPhone ? `: ${r.data.displayPhone}` : ""}.` });
            setV({ ...v, token: "" });
            router.refresh();
          }
        });
      }}
    >
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Nome do número" htmlFor="wa-label"><Input id="wa-label" value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} /></Field>
        <Field label="ID do número de telefone (Meta)" htmlFor="wa-pnid" hint="Painel da Meta → WhatsApp → Configuração da API."><Input id="wa-pnid" inputMode="numeric" value={v.phoneNumberId} onChange={(e) => setV({ ...v, phoneNumberId: e.target.value })} /></Field>
        <Field label="ID da conta do WhatsApp Business (opcional)" htmlFor="wa-waba" hint="Necessário para sincronizar os modelos aprovados."><Input id="wa-waba" inputMode="numeric" value={v.wabaId} onChange={(e) => setV({ ...v, wabaId: e.target.value })} /></Field>
        <Field label="Token de acesso permanente" htmlFor="wa-token" hint="Fica cifrado e nunca é mostrado de novo."><Input id="wa-token" type="password" autoComplete="off" value={v.token} onChange={(e) => setV({ ...v, token: e.target.value })} /></Field>
      </div>
      <Button type="submit" loading={pending}>{connected ? "Atualizar credenciais" : "Conectar número"}</Button>
    </form>
  );
}

export function AccountActions({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = React.useState<Msg>(null);
  const [pending, start] = React.useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) => start(async () => { const r = await fn(); setMsg(r.ok ? null : { tone: "error", text: r.message ?? "Não foi possível concluir." }); router.refresh(); });
  return (
    <div className="space-y-2">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" loading={pending} onClick={() => run(() => setEnabledAction(!enabled))}>{enabled ? "Desligar atendimento" : "Ligar atendimento"}</Button>
        <Button variant="danger" loading={pending} onClick={() => { if (window.confirm("Remover o número e APAGAR todas as conversas e mensagens? Não dá para desfazer.")) run(removeAccountAction); }}>Remover número e conversas</Button>
      </div>
    </div>
  );
}

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export function AwayForm({ initial }: { initial: { awayEnabled: boolean; awayMessage: string; openFrom: string; openUntil: string; openDays: number[] } }) {
  const router = useRouter();
  const [v, setV] = React.useState(initial);
  const [msg, setMsg] = React.useState<Msg>(null);
  const [pending, start] = React.useTransition();
  return (
    <div className="space-y-3">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.awayEnabled} onChange={(e) => setV({ ...v, awayEnabled: e.target.checked })} /> Responder automaticamente fora do expediente</label>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Início do expediente" htmlFor="wa-from"><Input id="wa-from" type="time" value={v.openFrom} onChange={(e) => setV({ ...v, openFrom: e.target.value })} /></Field>
        <Field label="Fim do expediente" htmlFor="wa-until"><Input id="wa-until" type="time" value={v.openUntil} onChange={(e) => setV({ ...v, openUntil: e.target.value })} /></Field>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        {DAYS.map((d, i) => (
          <label key={d} className="flex items-center gap-1"><input type="checkbox" checked={v.openDays.includes(i)} onChange={(e) => setV({ ...v, openDays: e.target.checked ? [...v.openDays, i] : v.openDays.filter((x) => x !== i) })} /> {d}</label>
        ))}
      </div>
      <Field label="Mensagem de ausência" htmlFor="wa-away" hint="Enviada no máximo uma vez a cada 12 horas por conversa, só fora do expediente."><Textarea id="wa-away" rows={3} value={v.awayMessage} onChange={(e) => setV({ ...v, awayMessage: e.target.value })} /></Field>
      <Button loading={pending} onClick={() => start(async () => {
        const r = await updateSettingsAction({ awayEnabled: v.awayEnabled, awayMessage: v.awayMessage || null, openFrom: v.openFrom, openUntil: v.openUntil, openDays: v.openDays });
        setMsg(r.ok ? { tone: "success", text: "Configuração salva." } : { tone: "error", text: errText(r, "Não foi possível salvar.") });
        router.refresh();
      })}>Salvar</Button>
    </div>
  );
}

export function QuickReplies({ items }: { items: { id: string; shortcut: string; title: string; body: string }[] }) {
  const router = useRouter();
  const [v, setV] = React.useState({ shortcut: "", title: "", body: "" });
  const [msg, setMsg] = React.useState<Msg>(null);
  const [pending, start] = React.useTransition();
  return (
    <div className="space-y-3">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {items.length === 0 ? <p className="text-sm text-muted">Nenhuma resposta rápida. No atendimento, digite “/” para usá-las.</p> : null}
      {items.map((r) => (
        <div key={r.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-2 text-sm">
          <div className="min-w-0"><div className="font-medium">/{r.shortcut} — {r.title}</div><p className="whitespace-pre-wrap break-words text-xs text-muted">{r.body}</p></div>
          <Button size="sm" variant="danger" loading={pending} onClick={() => start(async () => { const x = await deleteQuickReplyAction(r.id); setMsg(x.ok ? null : { tone: "error", text: x.message ?? "Erro." }); router.refresh(); })}>Excluir</Button>
        </div>
      ))}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Atalho" htmlFor="qr-sc"><Input id="qr-sc" placeholder="boas-vindas" value={v.shortcut} onChange={(e) => setV({ ...v, shortcut: e.target.value })} /></Field>
        <Field label="Título" htmlFor="qr-ti"><Input id="qr-ti" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
      </div>
      <Field label="Texto" htmlFor="qr-body"><Textarea id="qr-body" rows={3} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} /></Field>
      <Button loading={pending} onClick={() => start(async () => {
        const r = await saveQuickReplyAction(null, v);
        if (r.ok) { setV({ shortcut: "", title: "", body: "" }); setMsg(null); } else setMsg({ tone: "error", text: errText(r, "Erro.") });
        router.refresh();
      })}>Adicionar resposta rápida</Button>
    </div>
  );
}

export function SyncTemplates() {
  const router = useRouter();
  const [msg, setMsg] = React.useState<Msg>(null);
  const [pending, start] = React.useTransition();
  return (
    <div className="space-y-2">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <Button variant="secondary" loading={pending} onClick={() => start(async () => {
        const r = await syncTemplatesAction();
        setMsg(r.ok && r.data ? { tone: "success", text: `${r.data.total} modelo(s) encontrado(s); ${r.data.approved} aprovado(s).` } : { tone: "error", text: r.message ?? "Não foi possível sincronizar." });
        router.refresh();
      })}>Sincronizar modelos com a Meta</Button>
    </div>
  );
}

const QR_RISKS = [
  "Esta conexão NÃO é oficial: ela usa o WhatsApp Web, o que contraria os Termos de Uso do WhatsApp. O número pode ser desconectado ou BANIDO a qualquer momento, sem aviso.",
  "O celular precisa continuar com internet e com o WhatsApp instalado. Se o vínculo cair, o atendimento para até um novo QR-Code ser lido.",
  "Evite disparos em massa e mensagens para quem não conversa com você: é o que mais leva a banimento. Para uso crítico, prefira a API oficial da Meta.",
  "Só um número por escritório e só uma instância do sistema pode manter a sessão ligada.",
];

export function QrConnect({ connected, label: initialLabel }: { connected: boolean; label?: string }) {
  const router = useRouter();
  const [label, setLabel] = React.useState(initialLabel ?? "Atendimento");
  const [ack, setAck] = React.useState(false);
  const [msg, setMsg] = React.useState<Msg>(null);
  const [pending, start] = React.useTransition();
  return (
    <div className="space-y-3">
      <Alert tone="warning">
        <p className="font-medium">Leia antes de continuar</p>
        <ul className="list-disc space-y-1 pl-5">{QR_RISKS.map((r) => <li key={r}>{r}</li>)}</ul>
      </Alert>
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <Field label="Nome do número" htmlFor="qr-label"><Input id="qr-label" value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> <span>Entendi os riscos e quero conectar por QR-Code mesmo assim.</span></label>
      <Button loading={pending} disabled={!ack} onClick={() => start(async () => {
        const r = await connectQrAction({ label, riskAck: ack });
        if (!r.ok) setMsg({ tone: "error", text: errText(r, "Não foi possível iniciar a conexão.") });
        else { setMsg(null); router.refresh(); }
      })}>{connected ? "Trocar para conexão por QR-Code" : "Gerar QR-Code"}</Button>
    </div>
  );
}

export function QrPanel() {
  const router = useRouter();
  const [st, setSt] = React.useState<{ state: string; qrDataUrl: string | null; phone: string | null; message: string | null } | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const lastState = React.useRef<string | null>(null);
  React.useEffect(() => {
    let alive = true;
    const tick = async () => {
      const r = await qrStatusAction();
      if (!alive) return;
      if (r.ok && r.data) {
        setErr(null);
        setSt(r.data);
        if (lastState.current && lastState.current !== r.data.state && (r.data.state === "CONNECTED" || lastState.current === "CONNECTED")) router.refresh();
        lastState.current = r.data.state;
      } else setErr(r.message ?? "Não foi possível ler o estado da conexão.");
    };
    void tick();
    const id = setInterval(() => void tick(), 2500);
    return () => { alive = false; clearInterval(id); };
  }, [router]);
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) => start(async () => { const r = await fn(); setErr(r.ok ? null : r.message ?? "Erro."); router.refresh(); });
  const label: Record<string, string> = { CONNECTED: "Conectado", QR: "Aguardando a leitura do QR-Code", CONNECTING: "Conectando…", DISCONNECTED: "Desconectado" };
  return (
    <div className="space-y-3" data-testid="qr-panel">
      {err ? <Alert tone="error">{err}</Alert> : null}
      <p className="text-sm" data-testid="qr-state">{st ? `${label[st.state] ?? st.state}${st.phone ? ` · +${st.phone}` : ""}` : "Carregando…"}</p>
      {st?.message && st.state !== "CONNECTED" ? <p className="text-xs text-muted">{st.message}</p> : null}
      {st?.qrDataUrl ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={st.qrDataUrl} alt="QR-Code do WhatsApp" width={280} height={280} className="rounded-md border border-border bg-white p-2" data-testid="qr-image" />
          <p className="text-xs text-muted">No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho → aponte a câmera para este código. Ele se renova sozinho.</p>
        </div>
      ) : null}
      <p className="text-xs text-muted">Para trocar de aparelho ou número, use o pareamento abaixo. Não remova a conta: a remoção apaga o histórico. Uma nova sessão não importa conversas antigas de outros sistemas.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" loading={pending} onClick={() => {if(window.confirm("Gerar novo pareamento? A conexão anterior será encerrada. Conversas, mensagens e vínculos serão preservados. Campanhas em andamento serão pausadas para sua revisão."))run(qrRestartAction);}}>Trocar aparelho ou número (preservar histórico)</Button>
        <Button variant="danger" loading={pending} onClick={() => { if (window.confirm("Desconectar o WhatsApp deste sistema? As conversas ficam, mas será preciso ler um QR-Code novo para voltar.")) run(qrDisconnectAction); }}>Desconectar o aparelho</Button>
      </div>
    </div>
  );
}

type QueueView = { id: string; name: string; strategy: string; isDefault: boolean; active: boolean; team: { id: string; name: string; members: number } | null; open: number; waiting: number };
const STRATEGY_TEXT: Record<string, string> = { ROUND_ROBIN: "Rodízio (quem recebeu há mais tempo)", LEAST_LOAD: "Menor carga (menos conversas abertas)", MANUAL: "Manual (fica na fila até alguém pegar)" };

export function QueuesPanel({ queues, teams, agents }: { queues: QueueView[]; teams: { id: string; name: string }[]; agents: { id: string; name: string; available: boolean; open: number }[] }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<string | null>(null);
  const empty = { name: "", teamId: "", strategy: "ROUND_ROBIN", isDefault: false, active: true };
  const [v, setV] = React.useState(empty);
  const [msg, setMsg] = React.useState<Msg>(null);
  const [pending, start] = React.useTransition();
  const edit = (q: QueueView | null) => { setEditing(q?.id ?? null); setV(q ? { name: q.name, teamId: q.team?.id ?? "", strategy: q.strategy, isDefault: q.isDefault, active: q.active } : empty); setMsg(null); };
  return (
    <div className="space-y-4" data-testid="queues-panel">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {queues.length === 0 ? <p className="text-sm text-muted">Nenhuma fila. Sem fila, as conversas ficam “sem responsável” até alguém assumir. Crie uma fila padrão para distribuir automaticamente.</p> : null}
      {queues.map((q) => (
        <div key={q.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border p-2 text-sm">
          <div className="min-w-0">
            <div className="font-medium">{q.name}{q.isDefault ? " · padrão" : ""}{q.active ? "" : " · desativada"}</div>
            <p className="text-xs text-muted">{q.team ? `Equipe ${q.team.name} (${q.team.members})` : "Todos os atendentes"} · {STRATEGY_TEXT[q.strategy] ?? q.strategy}</p>
            <p className="text-xs text-muted">{q.open} aberta(s), {q.waiting} esperando atendente</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => edit(q)}>Editar</Button>
            <Button size="sm" variant="danger" loading={pending} onClick={() => { if (window.confirm("Excluir a fila? As conversas ficam, só perdem a fila.")) start(async () => { const r = await deleteQueueAction(q.id); setMsg(r.ok ? null : { tone: "error", text: errText(r, "Erro.") }); router.refresh(); }); }}>Excluir</Button>
          </div>
        </div>
      ))}
      <div className="space-y-3 rounded-md border border-border p-3">
        <div className="text-sm font-medium">{editing ? "Editar fila" : "Nova fila"}</div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Nome da fila" htmlFor="q-name"><Input id="q-name" placeholder="Previdenciário" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="Equipe" htmlFor="q-team" hint="Equipes são criadas no Box (Caixa de entrada → Equipes)."><Select id="q-team" value={v.teamId} onChange={(e) => setV({ ...v, teamId: e.target.value })}><option value="">Todos os atendentes</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Como distribuir" htmlFor="q-strategy"><Select id="q-strategy" value={v.strategy} onChange={(e) => setV({ ...v, strategy: e.target.value })}>{Object.entries(STRATEGY_TEXT).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</Select></Field>
          <div className="flex flex-col justify-end gap-1 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={v.isDefault} onChange={(e) => setV({ ...v, isDefault: e.target.checked })} /> Fila padrão (recebe as conversas novas)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Ativa</label>
          </div>
        </div>
        <div className="flex gap-2">
          <Button loading={pending} onClick={() => start(async () => {
            const r = await saveQueueAction(editing, { name: v.name, teamId: v.teamId || null, strategy: v.strategy as "ROUND_ROBIN", isDefault: v.isDefault, active: v.active });
            if (r.ok) { edit(null); setMsg({ tone: "success", text: "Fila salva." }); } else setMsg({ tone: "error", text: errText(r, "Não foi possível salvar.") });
            router.refresh();
          })}>{editing ? "Salvar fila" : "Criar fila"}</Button>
          {editing ? <Button variant="secondary" onClick={() => edit(null)}>Cancelar</Button> : null}
        </div>
      </div>
      <div className="space-y-2">
        <div className="text-sm font-medium">Atendentes</div>
        <ul className="space-y-1 text-sm">
          {agents.map((a) => <li key={a.id} className="flex justify-between rounded-md border border-border px-2 py-1"><span>{a.name}</span><span className="text-xs text-muted">{a.available ? "Disponível" : "Em pausa"} · {a.open} aberta(s)</span></li>)}
        </ul>
        <p className="text-xs text-muted">Cada atendente marca “Disponível” ou “Em pausa” no topo do Chat. Quem está em pausa não recebe conversas novas.</p>
        <Button variant="secondary" loading={pending} onClick={() => start(async () => { const r = await distributePendingAction(); setMsg(r.ok ? { tone: "success", text: `${r.data?.assigned ?? 0} conversa(s) distribuída(s).` } : { tone: "error", text: errText(r, "Erro.") }); router.refresh(); })}>Distribuir as que estão esperando</Button>
      </div>
    </div>
  );
}

export const LABEL_PALETTE = ["#2563eb", "#16a34a", "#ca8a04", "#dc2626", "#7c3aed", "#ea580c", "#0891b2", "#64748b"];
const KIND_TEXT: Record<string, string> = { TEXT: "Texto", NUMBER: "Número", DATE: "Data", SELECT: "Lista de opções" };


type LabelView = { id: string; name: string; color: string; uses: number };
type FieldView = { id: string; name: string; kind: string; options: string[]; active: boolean; uses: number };

export function LabelsPanel({ labels }: { labels: LabelView[] }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<string | null>(null);
  const [v, setV] = React.useState({ name: "", color: LABEL_PALETTE[0]! });
  const [msg, setMsg] = React.useState<Msg>(null);
  const [pending, start] = React.useTransition();
  const edit = (l: LabelView | null) => { setEditing(l?.id ?? null); setV(l ? { name: l.name, color: l.color } : { name: "", color: LABEL_PALETTE[0]! }); setMsg(null); };
  return (
    <div className="space-y-3" data-testid="labels-panel">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {labels.length === 0 ? <p className="text-sm text-muted">Nenhuma etiqueta ainda. Exemplos: “Previdenciário”, “Urgente”, “Aguardando documentos”.</p> : null}
      <ul className="flex flex-wrap gap-2">
        {labels.map((l) => (
          <li key={l.id} className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs" style={labelStyle(l.color)}>
            <span>{l.name} · {l.uses}</span>
            <button type="button" className="underline" onClick={() => edit(l)} aria-label={`Editar etiqueta ${l.name}`}>editar</button>
            <button type="button" className="underline" aria-label={`Excluir etiqueta ${l.name}`} onClick={() => { if (window.confirm("Excluir a etiqueta? Ela sai de todas as conversas.")) start(async () => { const r = await deleteLabelAction(l.id); setMsg(r.ok ? null : { tone: "error", text: errText(r, "Erro.") }); router.refresh(); }); }}>excluir</button>
          </li>
        ))}
      </ul>
      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
        <Field label="Nome da etiqueta" htmlFor="lb-name"><Input id="lb-name" value={v.name} maxLength={40} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <div className="flex gap-1" role="radiogroup" aria-label="Cor da etiqueta">
          {LABEL_PALETTE.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={v.color === c} aria-label={`Cor ${c}`} onClick={() => setV({ ...v, color: c })} className={`h-7 w-7 rounded-full border-2 ${v.color === c ? "ring-2 ring-offset-1" : ""}`} style={{ backgroundColor: c, borderColor: c }} />
          ))}
        </div>
        <div className="flex gap-2">
          <Button loading={pending} onClick={() => start(async () => {
            const r = await saveLabelAction(editing, v);
            if (r.ok) { edit(null); setMsg({ tone: "success", text: "Etiqueta salva." }); } else setMsg({ tone: "error", text: errText(r, "Não foi possível salvar.") });
            router.refresh();
          })}>{editing ? "Salvar etiqueta" : "Criar etiqueta"}</Button>
          {editing ? <Button variant="secondary" onClick={() => edit(null)}>Cancelar</Button> : null}
        </div>
      </div>
    </div>
  );
}

export function FieldsPanel({ fields }: { fields: FieldView[] }) {
  const router = useRouter();
  const empty = { name: "", kind: "TEXT", options: "", active: true };
  const [editing, setEditing] = React.useState<string | null>(null);
  const [v, setV] = React.useState(empty);
  const [msg, setMsg] = React.useState<Msg>(null);
  const [pending, start] = React.useTransition();
  const edit = (f: FieldView | null) => { setEditing(f?.id ?? null); setV(f ? { name: f.name, kind: f.kind, options: f.options.join("\n"), active: f.active } : empty); setMsg(null); };
  return (
    <div className="space-y-3" data-testid="fields-panel">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      {fields.length === 0 ? <p className="text-sm text-muted">Nenhum campo. Exemplos: “Número do benefício” (texto), “Tipo de ação” (lista), “Data da perícia” (data).</p> : null}
      {fields.map((f) => (
        <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
          <div className="min-w-0">
            <span className="font-medium">{f.name}</span> <span className="text-xs text-muted">{KIND_TEXT[f.kind]}{f.kind === "SELECT" ? `: ${f.options.join(", ")}` : ""}{f.active ? "" : " · desativado"} · {f.uses} preenchido(s)</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => edit(f)}>Editar</Button>
            <Button size="sm" variant="danger" loading={pending} onClick={() => { if (window.confirm("Excluir o campo? Os valores preenchidos nas conversas serão apagados.")) start(async () => { const r = await deleteFieldAction(f.id); setMsg(r.ok ? null : { tone: "error", text: errText(r, "Erro.") }); router.refresh(); }); }}>Excluir</Button>
          </div>
        </div>
      ))}
      <div className="space-y-3 rounded-md border border-border p-3">
        <div className="text-sm font-medium">{editing ? "Editar campo" : "Novo campo"}</div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Nome do campo" htmlFor="fd-name"><Input id="fd-name" value={v.name} maxLength={40} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="Tipo" htmlFor="fd-kind"><Select id="fd-kind" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>{Object.entries(KIND_TEXT).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</Select></Field>
          {v.kind === "SELECT" ? <Field label="Opções (uma por linha)" htmlFor="fd-opts"><Textarea id="fd-opts" rows={4} value={v.options} onChange={(e) => setV({ ...v, options: e.target.value })} /></Field> : null}
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Ativo (aparece nas conversas)</label>
        </div>
        <div className="flex gap-2">
          <Button loading={pending} onClick={() => start(async () => {
            const r = await saveFieldAction(editing, { name: v.name, kind: v.kind as "TEXT", options: v.kind === "SELECT" ? v.options.split("\n") : [], active: v.active });
            if (r.ok) { edit(null); setMsg({ tone: "success", text: "Campo salvo." }); } else setMsg({ tone: "error", text: errText(r, "Não foi possível salvar.") });
            router.refresh();
          })}>{editing ? "Salvar campo" : "Criar campo"}</Button>
          {editing ? <Button variant="secondary" onClick={() => edit(null)}>Cancelar</Button> : null}
        </div>
      </div>
    </div>
  );
}
