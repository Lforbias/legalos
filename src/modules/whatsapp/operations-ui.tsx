"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select } from "@/components/ui/form";
import { useRun } from "@/modules/kanban/use-run";
import { lifecycleSettingsAction, manualCallAction } from "./operations-actions";
type Account = {
    id: string;
    label: string;
    autoStatusEnabled: boolean;
    reopenAfterMinutes: number;
    reassignOnReopen: boolean;
};
export function LifecycleAccountForm({ account }: {
    account: Account;
}) {
    const { run, pending, error, done } = useRun();
    const [v, setV] = React.useState(account);
    return <form className="space-y-3 rounded border border-border p-3 text-sm" onSubmit={e => { e.preventDefault(); run(() => lifecycleSettingsAction(account.id, v), "Regras do atendimento salvas."); }}><p className="font-medium">{account.label}</p>{error ? <Alert tone="error">{error}</Alert> : null}{done ? <Alert tone="success">{done}</Alert> : null}<label className="flex gap-2"><input type="checkbox" checked={v.autoStatusEnabled} onChange={e => setV({ ...v, autoStatusEnabled: e.target.checked })}/>Atualizar situação automaticamente</label><p className="text-xs text-muted">Resposta humana enviada com sucesso marca Em atendimento. Nova mensagem reabre atendimentos fechados ou resolvidos. Uma resposta do cliente tira o atendimento de Aguardando. Automações e notas não marcam atendimento humano.</p><Field label={`Reiniciar após quantos minutos — ${account.label}`} htmlFor={`reopen-${account.id}`}><Input id={`reopen-${account.id}`} type="number" min={1} max={10080} value={v.reopenAfterMinutes} onChange={e => setV({ ...v, reopenAfterMinutes: Number(e.target.value) })}/></Field><label className="flex gap-2"><input type="checkbox" checked={v.reassignOnReopen} disabled={!v.autoStatusEnabled} onChange={e => setV({ ...v, reassignOnReopen: e.target.checked })}/>Redistribuir quando o cliente retornar após esse intervalo</label><p className="text-xs text-muted">O intervalo começa no encerramento. Antes dele, conserva o responsável. A redistribuição usa as regras e a disponibilidade da fila; pode deixar a conversa sem responsável se não houver pessoa disponível.</p><Button size="sm" type="submit" loading={pending}>Salvar regras de {account.label}</Button></form>;
}
export function ManualCallForm({ conversationId }: {
    conversationId: string;
}) {
    const { run, pending, error, done } = useRun();
    const [outcome, setOutcome] = React.useState("ANSWERED"), [direction, setDirection] = React.useState("IN"), [note, setNote] = React.useState("");
    return <details className="border-t border-border pt-2"><summary className="cursor-pointer text-xs font-medium">Registrar ligação</summary><form className="mt-2 space-y-2" onSubmit={e => { e.preventDefault(); run(() => manualCallAction(conversationId, { outcome, direction, note }), "Registro manual adicionado.", () => setNote("")); }}>{error ? <Alert tone="error">{error}</Alert> : null}{done ? <Alert tone="success">{done}</Alert> : null}<p className="text-xs text-muted">Só registra a ligação informada pela equipe. Não liga, atende nem grava áudio. Na conexão QR, eventos do aparelho também aparecem automaticamente quando recebidos.</p><Field label="Sentido da ligação" htmlFor="call-direction"><Select id="call-direction" value={direction} onChange={e => setDirection(e.target.value)}><option value="IN">Recebida</option><option value="OUT">Efetuada</option></Select></Field><Field label="Resultado da ligação" htmlFor="call-outcome"><Select id="call-outcome" value={outcome} onChange={e => setOutcome(e.target.value)}><option value="ANSWERED">Atendida</option><option value="MISSED">Não atendida</option><option value="REJECTED">Recusada</option><option value="ENDED">Encerrada</option></Select></Field><Field label="Observação da ligação" htmlFor="call-note"><Input id="call-note" value={note} maxLength={500} onChange={e => setNote(e.target.value)}/></Field><Button type="submit" size="sm" loading={pending}>Salvar registro da ligação</Button></form></details>;
}
