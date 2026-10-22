"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useRun } from "@/modules/kanban/use-run";
import { summarizeConversationAction } from "@/modules/ai/actions";
import { addFollowUpAction, addMetaNumberAction, addQrNumberAction, askSurveyAction, cancelScheduledAction, completeFollowUpAction, deleteFormAction, numberQrStatusAction, removeNumberAction, restartNumberQrAction, saveFormAction, scheduleMessageAction, setExtrasSettingsAction, setNumberEnabledAction } from "./extras-actions";

const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const toIso = (local: string) => { const d = new Date(local); return Number.isNaN(d.getTime()) ? "" : d.toISOString(); };
const Msg = ({ error, done }: { error: string | null; done: string | null }) => (error ? <Alert tone="error">{error}</Alert> : done ? <Alert tone="success">{done}</Alert> : null);

// ======================= números =======================
export type NumberRow = { id: string; label: string; provider: "META" | "QR"; isPrimary: boolean; enabled: boolean; phone: string | null; qrState: string | null; conversations: number };

export function NumbersPanel({ numbers, max }: { numbers: NumberRow[]; max: number }) {
  const { run, pending, error, done } = useRun();
  const [kind, setKind] = React.useState<"" | "META" | "QR">("");
  const [f, setF] = React.useState({ label: "", phoneNumberId: "", wabaId: "", token: "", riskAck: false });
  const [confirm, setConfirm] = React.useState<Record<string, string>>({});
  const [qr, setQr] = React.useState<{ id: string; url: string | null; state: string | null; msg: string | null } | null>(null);
  const extra = numbers.filter((n) => !n.isPrimary);
  React.useEffect(() => {
    if (!qr) return;
    const t = setInterval(async () => {
      const r = await numberQrStatusAction(qr.id);
      if (r.ok && r.data) {
        setQr((q) => (q ? { ...q, url: r.data!.qrDataUrl, state: r.data!.state, msg: r.data!.message } : q));
        if (r.data.state === "OPEN" || r.data.state === "CONNECTED") setQr(null);
      }
    }, 3000);
    return () => clearInterval(t);
  }, [qr?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-3 text-sm" data-testid="numbers-panel">
      <Msg error={error} done={done} />
      <ul className="divide-y divide-border rounded-md border border-border">
        {numbers.map((n) => (
          <li key={n.id} className="space-y-2 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><span className="font-medium">{n.label}</span> {n.isPrimary ? <Badge tone="info">Principal</Badge> : null} <Badge tone={n.provider === "QR" ? "warning" : "success"}>{n.provider === "QR" ? "QR-Code" : "API oficial"}</Badge> {!n.enabled ? <Badge tone="warning">Desligado</Badge> : null}
                <div className="text-xs text-muted">{n.phone ? `+${n.phone.replace(/\D/g, "")}` : "—"} · {n.conversations} conversa(s){n.qrState ? ` · ${n.qrState}` : ""}</div></div>
              {!n.isPrimary ? (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => setNumberEnabledAction(n.id, !n.enabled), n.enabled ? "Número desligado." : "Número ligado.")}>{n.enabled ? "Desligar" : "Ligar"}</Button>
                  {n.provider === "QR" && n.enabled ? <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => restartNumberQrAction(n.id), "Gerando novo QR-Code…", () => setQr({ id: n.id, url: null, state: "CONNECTING", msg: null }))}>QR-Code</Button> : null}
                </div>
              ) : null}
            </div>
            {!n.isPrimary ? (
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Apagar este número (digite o nome para confirmar)" htmlFor={`rm-${n.id}`}><Input id={`rm-${n.id}`} value={confirm[n.id] ?? ""} onChange={(e) => setConfirm({ ...confirm, [n.id]: e.target.value })} /></Field>
                <Button size="sm" variant="danger" loading={pending} disabled={(confirm[n.id] ?? "").trim() !== n.label} onClick={() => run(() => removeNumberAction(n.id, confirm[n.id] ?? ""), "Número removido.")}>Remover</Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {qr ? (
        <div className="space-y-2 rounded-md border border-border p-3" data-testid="number-qr">
          <p>Abra o WhatsApp no celular → Aparelhos conectados → Conectar um aparelho e leia o código.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr.url ? <img src={qr.url} alt="QR-Code para conectar o número" width={240} height={240} /> : <p className="text-muted">Gerando… {qr.msg ?? ""}</p>}
        </div>
      ) : null}
      {numbers.length >= max ? <Alert tone="info">Limite de {max} números por escritório atingido.</Alert> : numbers.length === 0 ? <Alert tone="info">Conecte primeiro o número principal (acima). Depois dá para adicionar outros aqui.</Alert> : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Button size="sm" variant={kind === "META" ? "primary" : "secondary"} onClick={() => setKind(kind === "META" ? "" : "META")}>Adicionar número (API oficial)</Button>
            <Button size="sm" variant={kind === "QR" ? "primary" : "secondary"} onClick={() => setKind(kind === "QR" ? "" : "QR")}>Adicionar número (QR-Code)</Button>
          </div>
          {kind ? (
            <div className="space-y-2 rounded-md border border-border p-3">
              <Field label="Nome do número (ex.: Previdenciário)" htmlFor="nn-label"><Input id="nn-label" value={f.label} maxLength={80} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
              {kind === "META" ? (
                <>
                  <Field label="ID do número de telefone (Meta)" htmlFor="nn-pn"><Input id="nn-pn" inputMode="numeric" value={f.phoneNumberId} onChange={(e) => setF({ ...f, phoneNumberId: e.target.value })} /></Field>
                  <Field label="ID da conta WhatsApp Business (opcional)" htmlFor="nn-waba"><Input id="nn-waba" inputMode="numeric" value={f.wabaId} onChange={(e) => setF({ ...f, wabaId: e.target.value })} /></Field>
                  <Field label="Token de acesso permanente" htmlFor="nn-tok"><Input id="nn-tok" type="password" autoComplete="off" value={f.token} onChange={(e) => setF({ ...f, token: e.target.value })} /></Field>
                  <Button loading={pending} onClick={() => run(() => addMetaNumberAction({ label: f.label, phoneNumberId: f.phoneNumberId, wabaId: f.wabaId || undefined, token: f.token }), "Número adicionado.", () => { setF({ label: "", phoneNumberId: "", wabaId: "", token: "", riskAck: false }); setKind(""); })}>Conferir na Meta e adicionar</Button>
                </>
              ) : (
                <>
                  <Alert tone="warning">Conexão por QR-Code não é oficial e traz risco de banimento do número.</Alert>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={f.riskAck} onChange={(e) => setF({ ...f, riskAck: e.target.checked })} /> Entendi os riscos</label>
                  <Button loading={pending} onClick={() => run(() => addQrNumberAction({ label: f.label, riskAck: f.riskAck }), "Número criado. Leia o QR-Code.", (d) => { if (d) setQr({ id: d.id, url: null, state: "CONNECTING", msg: null }); setKind(""); })}>Adicionar e gerar QR-Code</Button>
                </>
              )}
            </div>
          ) : null}
        </div>
      )}
      {extra.length === 0 && numbers.length > 0 ? <p className="text-xs text-muted">Cada conversa fica no número que a recebeu e é respondida por ele. Os modelos aprovados valem para o escritório todo.</p> : null}
    </div>
  );
}

// ======================= chaves dos extras =======================
export function ExtrasSettingsPanel({ s }: { s: { scheduledEnabled: boolean; npsEnabled: boolean; aiSummaryEnabled: boolean; npsQuestion: string } }) {
  const { run, pending, error, done } = useRun();
  const [q, setQ] = React.useState(s.npsQuestion);
  const row = (title: string, desc: string, on: boolean, key: "scheduledEnabled" | "npsEnabled" | "aiSummaryEnabled") => (
    <li className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
      <div className="min-w-0"><div className="font-medium">{title} <Badge tone={on ? "success" : "neutral"}>{on ? "Ligada" : "Desligada"}</Badge></div><p className="text-xs text-muted">{desc}</p></div>
      <Button size="sm" variant={on ? "secondary" : "primary"} loading={pending} onClick={() => run(() => setExtrasSettingsAction({ [key]: !on }), on ? "Desligado." : "Ligado.")}>{on ? "Desligar" : "Ligar"}</Button>
    </li>
  );
  return (
    <div className="space-y-3" data-testid="extras-settings">
      <Msg error={error} done={done} />
      <Alert tone="info">Nada é enviado sem uma pessoa mandar: a mensagem agendada é escrita por alguém, e a pesquisa só sai quando alguém aperta “Enviar pesquisa”. As duas nascem desligadas.</Alert>
      <ul className="divide-y divide-border rounded-md border border-border">
        {row("Mensagens agendadas", "A equipe escreve a mensagem e escolhe o dia e a hora; o sistema envia no horário.", s.scheduledEnabled, "scheduledEnabled")}
        {row("Pesquisa de satisfação (NPS)", "Pergunta de 0 a 10 enviada por quem atende; a nota entra no relatório.", s.npsEnabled, "npsEnabled")}
        {row("Resumo da conversa por IA", "Botão “Resumir conversa”: envia as últimas mensagens (CPF/CNPJ e e-mails ocultados) ao provedor de IA. Exige a IA ligada em Integrações e a chave do provedor.", s.aiSummaryEnabled, "aiSummaryEnabled")}
      </ul>
      <Field label="Pergunta da pesquisa" htmlFor="nps-q"><Textarea id="nps-q" rows={3} maxLength={500} value={q} onChange={(e) => setQ(e.target.value)} /></Field>
      <Button size="sm" loading={pending} onClick={() => run(() => setExtrasSettingsAction({ npsQuestion: q }), "Pergunta salva.")}>Salvar pergunta</Button>
    </div>
  );
}

// ======================= formulários =======================
export type FormRow = { id: string; name: string; active: boolean; fields: { fieldId: string; name: string; required: boolean }[] };
export function FormsPanel({ forms, fields }: { forms: FormRow[]; fields: { id: string; name: string }[] }) {
  const { run, pending, error, done } = useRun();
  const [name, setName] = React.useState("");
  const [sel, setSel] = React.useState<Record<string, "" | "opt" | "req">>({});
  const chosen = Object.entries(sel).filter(([, v]) => v).map(([fieldId, v]) => ({ fieldId, required: v === "req" }));
  return (
    <div className="space-y-3 text-sm" data-testid="forms-panel">
      <Msg error={error} done={done} />
      {fields.length === 0 ? <Alert tone="info">Crie antes os “Campos personalizados” (mais abaixo). O formulário é uma lista desses campos para preencher durante o atendimento.</Alert> : null}
      {forms.length ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {forms.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
              <div><span className="font-medium">{f.name}</span><div className="text-xs text-muted">{f.fields.map((x) => `${x.name}${x.required ? "*" : ""}`).join(", ")}</div></div>
              <Button size="sm" variant="danger" loading={pending} onClick={() => run(() => deleteFormAction(f.id), "Formulário apagado.")}>Apagar</Button>
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-muted">Nenhum formulário ainda.</p>}
      {fields.length ? (
        <div className="space-y-2 rounded-md border border-border p-3">
          <Field label="Nome do formulário (ex.: Triagem previdenciária)" htmlFor="fm-name"><Input id="fm-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="space-y-1">
            {fields.map((x) => (
              <div key={x.id} className="flex items-center justify-between gap-2">
                <span>{x.name}</span>
                <Select aria-label={`Campo ${x.name}`} value={sel[x.id] ?? ""} onChange={(e) => setSel({ ...sel, [x.id]: e.target.value as "" | "opt" | "req" })} className="w-40">
                  <option value="">Não usar</option><option value="opt">Opcional</option><option value="req">Obrigatório</option>
                </Select>
              </div>
            ))}
          </div>
          <Button loading={pending} disabled={!name.trim() || chosen.length === 0} onClick={() => run(() => saveFormAction(null, { name, fields: chosen }), "Formulário criado.", () => { setName(""); setSel({}); })}>Criar formulário</Button>
        </div>
      ) : null}
    </div>
  );
}

// ======================= dentro da conversa =======================
export type ConversationExtrasData = {
  conversationId: string;
  canWrite: boolean;
  scheduledEnabled: boolean;
  npsEnabled: boolean;
  aiSummaryEnabled: boolean;
  canAi: boolean;
  me: string;
  agents: { id: string; name: string }[];
  followUps: { id: string; dueAt: string; note: string; assigneeId: string | null }[];
  scheduled: { id: string; body: string; sendAt: string; status: string; error: string | null }[];
  survey: { status: string; score: number | null } | null;
  forms: { id: string; name: string; filled: number; total: number; missingRequired: string[] }[];
};

export function ConversationExtras({ d }: { d: ConversationExtrasData }) {
  const { run, pending, error, done } = useRun();
  const [fu, setFu] = React.useState({ at: "", note: "", who: d.me });
  const [sc, setSc] = React.useState({ at: "", text: "" });
  const [summary, setSummary] = React.useState<string | null>(null);
  const name = (id: string | null) => d.agents.find((a) => a.id === id)?.name ?? "—";
  return (
    <div className="space-y-3 border-t border-border p-3 text-xs" data-testid="conv-extras">
      <Msg error={error} done={done} />
      <section className="space-y-1">
        <h4 className="font-semibold uppercase tracking-wide text-primary-text">Retornos combinados</h4>
        {d.followUps.length ? <ul className="space-y-1">{d.followUps.map((f) => (
          <li key={f.id} className="flex items-start justify-between gap-2 rounded border border-border p-1.5"><span>{fmt(f.dueAt)} · {name(f.assigneeId)}<br />{f.note}</span>{d.canWrite ? <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => completeFollowUpAction(f.id), "Concluído.")}>Feito</Button> : null}</li>
        ))}</ul> : <p className="text-muted">Nenhum retorno marcado.</p>}
        {d.canWrite ? (
          <div className="space-y-1">
            <Input aria-label="Quando retornar" type="datetime-local" value={fu.at} onChange={(e) => setFu({ ...fu, at: e.target.value })} />
            <Input aria-label="Lembrete" placeholder="O que combinar (ex.: ligar sobre documentos)" maxLength={500} value={fu.note} onChange={(e) => setFu({ ...fu, note: e.target.value })} />
            <Select aria-label="Responsável pelo retorno" value={fu.who} onChange={(e) => setFu({ ...fu, who: e.target.value })}>{d.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
            <Button size="sm" loading={pending} disabled={!fu.at || !fu.note.trim()} onClick={() => run(() => addFollowUpAction(d.conversationId, { dueAt: toIso(fu.at), note: fu.note, assigneeId: fu.who }), "Retorno marcado. A equipe será avisada no horário.", () => setFu({ at: "", note: "", who: d.me }))}>Marcar retorno</Button>
            <p className="text-muted">Avisa a equipe; não envia nada ao cliente.</p>
          </div>
        ) : null}
      </section>
      <section className="space-y-1">
        <h4 className="font-semibold uppercase tracking-wide text-primary-text">Mensagem agendada</h4>
        {d.scheduled.length ? <ul className="space-y-1">{d.scheduled.map((m) => (
          <li key={m.id} className="rounded border border-border p-1.5">
            <div className="flex items-center justify-between gap-2"><span>{fmt(m.sendAt)} <Badge tone={m.status === "SENT" ? "success" : m.status === "PENDING" ? "info" : "neutral"}>{({ PENDING: "Agendada", SENT: "Enviada", FAILED: "Falhou", CANCELED: "Cancelada", SENDING: "Enviando" } as Record<string, string>)[m.status] ?? m.status}</Badge></span>
              {m.status === "PENDING" && d.canWrite ? <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => cancelScheduledAction(m.id), "Agendamento cancelado.")}>Cancelar</Button> : null}</div>
            <div className="line-clamp-2">{m.body}</div>{m.error ? <div className="text-danger">{m.error}</div> : null}
          </li>
        ))}</ul> : null}
        {!d.scheduledEnabled ? <p className="text-muted">Desligado. Quem administra o Chat liga em Configurações.</p> : d.canWrite ? (
          <div className="space-y-1">
            <Textarea aria-label="Mensagem a agendar" rows={3} maxLength={4096} value={sc.text} onChange={(e) => setSc({ ...sc, text: e.target.value })} />
            <Input aria-label="Enviar em" type="datetime-local" value={sc.at} onChange={(e) => setSc({ ...sc, at: e.target.value })} />
            <Button size="sm" loading={pending} disabled={!sc.at || !sc.text.trim()} onClick={() => run(() => scheduleMessageAction(d.conversationId, { text: sc.text, sendAt: toIso(sc.at) }), "Mensagem agendada.", () => setSc({ at: "", text: "" }))}>Agendar envio</Button>
            <p className="text-muted">Vale a regra da janela de 24 h da API oficial: se estiver fechada no horário, a mensagem falha e você é avisado.</p>
          </div>
        ) : null}
      </section>
      <section className="space-y-1">
        <h4 className="font-semibold uppercase tracking-wide text-primary-text">Pesquisa de satisfação</h4>
        {d.survey ? <p>{d.survey.status === "ANSWERED" ? `Respondida: nota ${d.survey.score}.` : d.survey.status === "ASKED" ? "Enviada, aguardando resposta." : "Pesquisa anterior expirada."}</p> : null}
        {!d.npsEnabled ? <p className="text-muted">Desligada. Quem administra o Chat liga em Configurações.</p> : d.canWrite && d.survey?.status !== "ASKED" ? (
          <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => askSurveyAction(d.conversationId), "Pesquisa enviada ao cliente.")}>Enviar pesquisa</Button>
        ) : null}
      </section>
      {d.forms.length ? (
        <section className="space-y-1">
          <h4 className="font-semibold uppercase tracking-wide text-primary-text">Formulários</h4>
          {d.forms.map((f) => <div key={f.id} className="rounded border border-border p-1.5"><span className="font-medium">{f.name}</span> · {f.filled}/{f.total} preenchidos{f.missingRequired.length ? <div className="text-danger">Falta: {f.missingRequired.join(", ")}</div> : <div className="text-success">Obrigatórios completos.</div>}</div>)}
          <p className="text-muted">Preencha os campos na seção “Campos” acima.</p>
        </section>
      ) : null}
      {d.aiSummaryEnabled && d.canAi ? (
        <section className="space-y-1">
          <h4 className="font-semibold uppercase tracking-wide text-primary-text">Resumo por IA</h4>
          <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => summarizeConversationAction(d.conversationId), undefined, (r) => setSummary(r?.summary ?? null))}>Resumir conversa</Button>
          {summary ? <p className="whitespace-pre-wrap rounded border border-border p-1.5" data-testid="chat-summary">{summary}<span className="mt-1 block text-muted">Gerado por IA; confira antes de usar. Não fica gravado.</span></p> : null}
        </section>
      ) : null}
      <a className="underline" href={`/api/chat/export?c=${d.conversationId}`}>Baixar esta conversa (CSV)</a>
    </div>
  );
}
