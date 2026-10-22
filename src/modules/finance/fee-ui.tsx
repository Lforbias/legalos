"use client";

import Link from "next/link";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { useRun } from "@/modules/kanban/use-run";
import { cancelChargeAction, cancelContractAction, createChargeAction, createContractAction, saveFeeConfigAction, setFeeEnabledAction, testFeeConfigAction, triggerContractAction } from "./fee-actions";

export function FeeConfigPanel({ status, accounts }: { status: { configured: boolean; enabled: boolean; sandbox: boolean; accountId: string | null; webhookUrl: string; webhookToken: string | null }; accounts: { id: string; name: string }[] }) {
  const { run, pending, error, done } = useRun();
  const [sandbox, setSandbox] = React.useState(status.sandbox);
  return (
    <div className="space-y-4">
      <Alert tone="info">Use a conta Asaas do escritório. Comece pela SANDBOX (ambiente de teste) e só depois passe para produção. O sistema nunca manda o link de cobrança ao cliente sozinho: quem gera copia e envia.</Alert>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => saveFeeConfigAction({ apiKey: String(fd.get("apiKey") ?? ""), sandbox, accountId: fd.get("accountId") }), "Configuração salva. Ligue depois de testar.");
        }}
      >
        <Field label={status.configured ? "Nova chave de API (deixe em branco para manter)" : "Chave de API do Asaas"} htmlFor="fc-key"><Input id="fc-key" name="apiKey" type="password" autoComplete="off" /></Field>
        <Field label="Conta onde os recebimentos serão baixados" htmlFor="fc-acc">
          <Select id="fc-acc" name="accountId" defaultValue={status.accountId ?? ""} required><option value="" disabled>Escolha</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select>
        </Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} /> Ambiente de teste (sandbox)</label>
        <div><Button type="submit" loading={pending}>Salvar</Button></div>
      </form>
      {status.configured ? (
        <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
          <p><span className="font-medium">No painel do Asaas</span> (Integrações → Webhooks), cadastre:</p>
          <p className="break-all">URL: <code>{status.webhookUrl}</code></p>
          <p className="break-all">Token de autenticação: <code>{status.webhookToken}</code></p>
          <p className="text-xs text-muted">Eventos: pagamento recebido, confirmado, vencido e estornado.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" loading={pending} onClick={() => run(() => testFeeConfigAction(), "Conexão com o Asaas funcionando.")}>Testar conexão</Button>
            <Badge tone={status.enabled ? "success" : "neutral"}>{status.enabled ? "Cobrança ligada" : "Cobrança desligada"}</Badge>
            <Button size="sm" variant={status.enabled ? "ghost" : "primary"} loading={pending} onClick={() => run(() => setFeeEnabledAction(!status.enabled))}>{status.enabled ? "Desligar" : "Ligar"}</Button>
          </div>
        </div>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {done ? <Alert tone="success">{done}</Alert> : null}
    </div>
  );
}

export type ChargeRow = { id: string; billingType: string; value: string; status: string; invoiceUrl: string | null; boletoUrl: string | null; pixPayload: string | null; pixImage: string | null };
const CH_LABEL: Record<string, string> = { PENDING: "Aguardando pagamento", PAID: "Paga", OVERDUE: "Vencida", CANCELED: "Cancelada", REFUNDED: "Estornada" };

export function ChargesCard({ entryId, rows, enabled, canWrite }: { entryId: string; rows: ChargeRow[]; enabled: boolean; canWrite: boolean }) {
  const { run, pending, error } = useRun();
  const [copied, setCopied] = React.useState<string | null>(null);
  return (
    <div className="space-y-3">
      {!enabled ? <p className="text-sm text-muted">A cobrança por Pix e boleto está desligada ou não configurada (Financeiro → Cobrança).</p> : null}
      {enabled && canWrite ? (
        <div className="flex gap-2">
          <Button size="sm" loading={pending} onClick={() => run(() => createChargeAction(entryId, "PIX"))}>Gerar Pix</Button>
          <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => createChargeAction(entryId, "BOLETO"))}>Gerar boleto</Button>
        </div>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-lg border border-border p-3 text-sm">
            <div className="flex items-center justify-between gap-2"><span>{r.billingType === "PIX" ? "Pix" : "Boleto"} · R$ {r.value.replace(".", ",")}</span><Badge tone={r.status === "PAID" ? "success" : r.status === "PENDING" ? "info" : "warning"}>{CH_LABEL[r.status] ?? r.status}</Badge></div>
            {r.pixPayload && r.status === "PENDING" ? (
              <div className="mt-2 space-y-2">
                {r.pixImage ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="QR Code do Pix" className="h-40 w-40 rounded border border-border bg-white p-1" src={`data:image/png;base64,${r.pixImage}`} />
                  </>
                ) : null}
                <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard?.writeText(r.pixPayload!); setCopied(r.id); }}>{copied === r.id ? "Copiado" : "Copiar Pix copia e cola"}</Button>
              </div>
            ) : null}
            {r.boletoUrl && r.status === "PENDING" ? <p className="mt-2"><a className="underline" href={r.boletoUrl} target="_blank" rel="noopener noreferrer">Abrir boleto</a></p> : null}
            {r.invoiceUrl && r.status === "PENDING" ? <p className="mt-1"><a className="underline" href={r.invoiceUrl} target="_blank" rel="noopener noreferrer">Página da cobrança (link para o cliente)</a></p> : null}
            {canWrite && (r.status === "PENDING" || r.status === "OVERDUE") ? <Button className="mt-2" size="sm" variant="ghost" loading={pending} onClick={() => run(() => cancelChargeAction(r.id, entryId))}>Cancelar cobrança</Button> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export type ContractRow = { id: string; title: string; clientName: string; percent: string | null; fixedAmount: string | null; baseNote: string | null; status: string; expected: string | null; entryId: string | null; caseId: string | null };

export function ContractsPanel({ rows, clients, canWrite }: { rows: ContractRow[]; clients: { id: string; name: string }[]; canWrite: boolean }) {
  const { run, pending, error } = useRun();
  const [trig, setTrig] = React.useState<Record<string, { base: string; due: string }>>({});
  return (
    <div className="space-y-4">
      {canWrite ? (
        <form
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            run(() => createContractAction(Object.fromEntries(["clientId", "title", "percent", "fixedAmount", "expectedBase", "baseNote"].map((k) => [k, String(fd.get(k) ?? "")]))), undefined, () => form.reset());
          }}
        >
          <Field label="Cliente" htmlFor="ct-c"><Select id="ct-c" name="clientId" required defaultValue=""><option value="" disabled>Escolha</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Título" htmlFor="ct-t"><Input id="ct-t" name="title" required placeholder="Êxito — ação previdenciária" /></Field>
          <Field label="Êxito (%)" htmlFor="ct-p" hint="Ou um valor fixo ao lado."><Input id="ct-p" name="percent" placeholder="30" /></Field>
          <Field label="Valor fixo (R$)" htmlFor="ct-f"><Input id="ct-f" name="fixedAmount" placeholder="0,00" /></Field>
          <Field label="Base estimada (R$)" htmlFor="ct-b" hint="O que se espera obter (projeção)."><Input id="ct-b" name="expectedBase" placeholder="0,00" /></Field>
          <Field label="Base do êxito" htmlFor="ct-n"><Input id="ct-n" name="baseNote" placeholder="valor dos atrasados" /></Field>
          <div className="sm:col-span-2 lg:col-span-3"><Button type="submit" loading={pending}>Cadastrar contrato</Button></div>
        </form>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      <ul className="divide-y divide-border">
        {rows.length === 0 ? <li className="py-2 text-sm text-muted">Nenhum contrato de êxito.</li> : null}
        {rows.map((r) => (
          <li key={r.id} className="space-y-2 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span><span className="font-medium">{r.title}</span> · {r.clientName} · {r.percent ? `${r.percent.replace(/\.?0+$/, "")}%` : `R$ ${r.fixedAmount?.replace(".", ",")}`}{r.baseNote ? ` sobre ${r.baseNote}` : ""}</span>
              <Badge tone={r.status === "ACTIVE" ? "info" : "success"}>{r.status === "ACTIVE" ? (r.expected ? `Previsto R$ ${r.expected.replace(".", ",")}` : "Aguardando êxito") : "Honorário gerado"}</Badge>
            </div>
            {r.status === "TRIGGERED" && r.entryId ? <Link className="text-xs underline" href={`/financeiro/lancamentos/${r.entryId}`}>Ver lançamento a receber</Link> : null}
            {canWrite && r.status === "ACTIVE" ? (
              <div className="flex flex-wrap items-end gap-2">
                {!r.fixedAmount ? <Input aria-label="Valor obtido no processo" className="w-44" placeholder="Valor obtido (R$)" value={trig[r.id]?.base ?? ""} onChange={(e) => setTrig((t) => ({ ...t, [r.id]: { base: e.target.value, due: t[r.id]?.due ?? "" } }))} /> : null}
                <Input aria-label="Vencimento do honorário" type="date" className="w-40" value={trig[r.id]?.due ?? ""} onChange={(e) => setTrig((t) => ({ ...t, [r.id]: { base: t[r.id]?.base ?? "", due: e.target.value } }))} />
                <Button size="sm" loading={pending} onClick={() => run(() => triggerContractAction(r.id, trig[r.id]?.base ?? "", trig[r.id]?.due ?? ""))}>O êxito ocorreu: gerar honorário</Button>
                <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => cancelContractAction(r.id))}>Cancelar contrato</Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
