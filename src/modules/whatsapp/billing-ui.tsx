"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { billNowAction, removeOptoutAction, saveBillingAction } from "./actions";
import { BILLING_KIND_LABEL, BILLING_VARS_HINT, OFFSET_PRESETS, offsetLabel, renderBilling, type BillingKind } from "./billing-schema";

export type BillingView = { offsets: number[]; sendHour: number; skipWeekends: boolean; maxOverdueDays: number; beforeText: string; dueText: string; overdueText: string; paymentInfo: string | null; templateId: string | null };
export type SendRow = { id: string; status: string; kind: BillingKind; reason: string | null; manual: boolean; createdAt: string; client: string; entry: string; due: string | null };
export type OptoutRow = { waId: string; source: string; createdAt: string };
type Msg = { tone: "error" | "success"; text: string } | null;

const STATUS_LABEL: Record<string, string> = { SENT: "Enviado", FAILED: "Falhou", SKIPPED: "Não enviado", SENDING: "Enviando" };
const statusTone = (s: string) => (s === "SENT" ? "success" : s === "FAILED" ? "danger" : "warning") as "success" | "danger" | "warning";
const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const SAMPLE = { nome: "Maria", valor: "R$ 500,00", vencimento: "10/11/2026", parcela: "2/6", descricao: "Honorários — ação trabalhista" };

function errText(r: { message?: string; fieldErrors?: Record<string, string[] | undefined> }, fallback: string): string {
  const f = r.fieldErrors ? Object.values(r.fieldErrors).flat().filter(Boolean).join(" ") : "";
  if (r.message && r.message !== "Corrija os campos destacados.") return r.message;
  return f || r.message || fallback;
}

export function BillingPanel({ settings, templates, sends, optouts }: { settings: BillingView; templates: { id: string; name: string; language: string; variableCount: number }[]; sends: SendRow[]; optouts: OptoutRow[] }) {
  const router = useRouter();
  const [v, setV] = React.useState({ ...settings, paymentInfo: settings.paymentInfo ?? "", templateId: settings.templateId ?? "", maxOverdueDays: String(settings.maxOverdueDays), sendHour: String(settings.sendHour) });
  const [msg, setMsg] = React.useState<Msg>(null);
  const [pending, start] = React.useTransition();
  const toggle = (o: number) => setV({ ...v, offsets: v.offsets.includes(o) ? v.offsets.filter((x) => x !== o) : [...v.offsets, o] });
  const extra = (t: string) => renderBilling(t, SAMPLE) + (v.paymentInfo.trim() ? `\n\n${v.paymentInfo.trim()}` : "") + "\n\nPara não receber mais estes lembretes, responda PARAR.";

  return (
    <div className="space-y-4" data-testid="billing-panel">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <Alert tone="info">
        Só parcelas de honorários a receber, com cliente e telefone no cadastro. Cada momento é enviado uma única vez por parcela. Pagou ou cancelou, para sozinho. Se o cliente responder PARAR, ele sai da lista. Fora da janela de 24h da API oficial da Meta, só é enviado com um modelo aprovado; sem modelo, a cobrança fica registrada como “não enviada”.
      </Alert>
      <Alert tone="warning">Salvar estas configurações <strong>não liga</strong> o envio automático. Para ligar ou desligar, use os interruptores no topo desta página.</Alert>

      <fieldset className="space-y-1 text-sm">
        <legend className="mb-1 text-xs font-medium">Quando enviar</legend>
        <div className="grid gap-1 md:grid-cols-2">
          {OFFSET_PRESETS.map((o) => (
            <label key={o} className="flex items-center gap-2"><input type="checkbox" checked={v.offsets.includes(o)} onChange={() => toggle(o)} aria-label={offsetLabel(o)} /> {offsetLabel(o)}</label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Hora do envio (fuso do escritório)" htmlFor="bl-hour"><Input id="bl-hour" type="number" min={0} max={23} value={v.sendHour} onChange={(e) => setV({ ...v, sendHour: e.target.value })} /></Field>
        <Field label="Parar de cobrar após (dias de atraso)" htmlFor="bl-max"><Input id="bl-max" type="number" min={1} max={365} value={v.maxOverdueDays} onChange={(e) => setV({ ...v, maxOverdueDays: e.target.value })} /></Field>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={v.skipWeekends} onChange={(e) => setV({ ...v, skipWeekends: e.target.checked })} /> Não enviar aos fins de semana</label>
      </div>

      <p className="text-xs text-muted">{BILLING_VARS_HINT}</p>
      <div className="grid gap-3">
        <Field label={BILLING_KIND_LABEL.BEFORE} htmlFor="bl-before"><Textarea id="bl-before" rows={3} maxLength={800} value={v.beforeText} onChange={(e) => setV({ ...v, beforeText: e.target.value })} /></Field>
        <Field label={BILLING_KIND_LABEL.DUE} htmlFor="bl-due"><Textarea id="bl-due" rows={3} maxLength={800} value={v.dueText} onChange={(e) => setV({ ...v, dueText: e.target.value })} /></Field>
        <Field label={BILLING_KIND_LABEL.OVERDUE} htmlFor="bl-over"><Textarea id="bl-over" rows={3} maxLength={800} value={v.overdueText} onChange={(e) => setV({ ...v, overdueText: e.target.value })} /></Field>
        <Field label="Dados para pagamento (opcional, vai no final de toda mensagem)" htmlFor="bl-pay"><Textarea id="bl-pay" rows={2} maxLength={500} placeholder="Ex.: PIX CNPJ 00.000.000/0001-00 — TSB Advocacia" value={v.paymentInfo} onChange={(e) => setV({ ...v, paymentInfo: e.target.value })} /></Field>
        <Field label="Modelo aprovado da Meta (usado quando a janela de 24h está fechada)" htmlFor="bl-tpl">
          <Select id="bl-tpl" value={v.templateId} onChange={(e) => setV({ ...v, templateId: e.target.value })}>
            <option value="">Nenhum (não envia fora da janela)</option>
            {templates.map((t) => <option key={t.id} value={t.id} disabled={t.variableCount > 5}>{t.name} ({t.language}) — {t.variableCount} variáve{t.variableCount === 1 ? "l" : "is"}</option>)}
          </Select>
        </Field>
        <p className="text-xs text-muted">O modelo recebe, nesta ordem: {"{{1}}"} nome, {"{{2}}"} valor, {"{{3}}"} vencimento, {"{{4}}"} parcela, {"{{5}}"} descrição.</p>
      </div>

      <div>
        <div className="text-xs font-medium">Como o cliente vai ver (atraso)</div>
        <pre className="mt-1 whitespace-pre-wrap rounded-md bg-surface-2 p-2 text-xs" data-testid="bl-preview">{extra(v.overdueText)}</pre>
      </div>

      <Button loading={pending} onClick={() => start(async () => {
        const r = await saveBillingAction({ offsets: v.offsets, sendHour: Number(v.sendHour), skipWeekends: v.skipWeekends, maxOverdueDays: Number(v.maxOverdueDays), beforeText: v.beforeText, dueText: v.dueText, overdueText: v.overdueText, paymentInfo: v.paymentInfo.trim() || null, templateId: v.templateId || null });
        setMsg(r.ok ? { tone: "success", text: "Cobrança automática salva." } : { tone: "error", text: errText(r, "Não foi possível salvar.") });
        router.refresh();
      })}>Salvar cobrança</Button>

      <div className="space-y-1">
        <div className="text-sm font-medium">Últimos envios</div>
        {sends.length === 0 ? <p className="text-xs text-muted">Nenhum envio ainda.</p> : (
          <ul className="divide-y divide-border rounded-md border border-border text-xs" data-testid="bl-sends">
            {sends.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 p-2">
                <Badge tone={statusTone(s.status)}>{STATUS_LABEL[s.status] ?? s.status}</Badge>
                <span className="font-medium">{s.client}</span>
                <span>{s.entry}{s.due ? ` · vence ${s.due.split("-").reverse().join("/")}` : ""}</span>
                <span className="text-muted">{BILLING_KIND_LABEL[s.kind]}{s.manual ? " (manual)" : ""} · {fmt(s.createdAt)}{s.reason ? ` · ${s.reason}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1">
        <div className="text-sm font-medium">Clientes que pediram para parar</div>
        {optouts.length === 0 ? <p className="text-xs text-muted">Ninguém pediu para parar.</p> : (
          <ul className="divide-y divide-border rounded-md border border-border text-xs" data-testid="bl-optouts">
            {optouts.map((o) => (
              <li key={o.waId} className="flex items-center justify-between gap-2 p-2">
                <span>{o.waId} · {o.source === "REPLY" ? "respondeu PARAR" : "manual"} · {fmt(o.createdAt)}</span>
                <Button size="sm" variant="secondary" onClick={() => start(async () => {
                  const r = await removeOptoutAction(o.waId);
                  setMsg(r.ok ? { tone: "success", text: "Cliente voltou a receber lembretes." } : { tone: "error", text: errText(r, "Não foi possível reativar.") });
                  router.refresh();
                })}>Voltar a cobrar</Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Botão e histórico na tela da parcela. */
export function BillNowButton({ entryId, available, reason, history }: { entryId: string; available: boolean; reason: string | null; history: { id: string; status: string; kind: BillingKind; reason: string | null; manual: boolean; createdAt: string }[] }) {
  const router = useRouter();
  const [msg, setMsg] = React.useState<Msg>(null);
  const [pending, start] = React.useTransition();
  return (
    <div className="space-y-2 text-sm" data-testid="bill-now">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <Button loading={pending} disabled={!available} onClick={() => start(async () => {
        const r = await billNowAction(entryId);
        setMsg(r.ok ? { tone: "success", text: "Cobrança enviada pelo WhatsApp." } : { tone: "error", text: errText(r, "Não foi possível enviar.") });
        router.refresh();
      })}>Cobrar pelo WhatsApp</Button>
      {!available && reason ? <p className="text-xs text-muted">{reason}</p> : null}
      {history.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border border-border text-xs" data-testid="bill-history">
          {history.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-2 p-2">
              <Badge tone={statusTone(h.status)}>{STATUS_LABEL[h.status] ?? h.status}</Badge>
              <span>{BILLING_KIND_LABEL[h.kind]}{h.manual ? " (manual)" : ""} · {fmt(h.createdAt)}{h.reason ? ` · ${h.reason}` : ""}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
