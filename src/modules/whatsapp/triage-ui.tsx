"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/form";
import { createTriageRulesAction } from "./actions";
import { TRIAGE_AREAS } from "./triage-schema";

type Msg = { tone: "error" | "success"; text: string } | null;

export function TriagePanel({ queues, agents, existing }: { queues: { id: string; name: string }[]; agents: { id: string; name: string }[]; existing: string[] }) {
  const router = useRouter();
  const [rows, setRows] = React.useState(() => TRIAGE_AREAS.map((a) => ({ key: a.key, queueId: "", userId: "", keywords: a.keywords.join(", ") })));
  const [msg, setMsg] = React.useState<Msg>(null);
  const [pending, start] = React.useTransition();
  const upd = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const submit = () => start(async () => {
    const areas = rows.filter((r) => r.queueId || r.userId).map((r) => ({ key: r.key, queueId: r.queueId || null, userId: r.userId || null, keywords: r.keywords }));
    if (!areas.length) { setMsg({ tone: "error", text: "Escolha uma fila ou um atendente em pelo menos uma área." }); return; }
    const r = await createTriageRulesAction({ areas });
    if (r.ok && r.data) {
      setMsg({ tone: "success", text: `${r.data.created.length ? `Criadas (desligadas): ${r.data.created.join(", ")}. ` : ""}${r.data.skipped.length ? `Já existiam: ${r.data.skipped.join(", ")}. ` : ""}Ligue cada regra na lista de automações abaixo.` });
      router.refresh();
    } else setMsg({ tone: "error", text: (r.fieldErrors ? Object.values(r.fieldErrors).flat().filter(Boolean).join(" ") : "") || r.message || "Não foi possível criar." });
  });
  return (
    <div className="space-y-4" data-testid="triage-panel">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <Alert tone="info">Modelo pronto: quando o cliente escrever certas palavras, a conversa vai para a fila e/ou o atendente da área. As regras nascem <strong>desligadas</strong> e não escrevem ao cliente. “Outros assuntos” vão para a fila padrão. Se a mensagem citar duas áreas, vale a última regra que disparar. {existing.length ? `Já criadas: ${existing.join(", ")}.` : ""}</Alert>
      {rows.map((r, i) => {
        const def = TRIAGE_AREAS[i]!;
        return (
          <fieldset key={r.key} className="space-y-2 rounded-md border border-border p-3" data-testid={`triage-${r.key}`}>
            <legend className="px-1 text-sm font-medium">{def.label}</legend>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Fila" htmlFor={`tr-q-${r.key}`}><Select id={`tr-q-${r.key}`} value={r.queueId} onChange={(e) => upd(i, { queueId: e.target.value })}><option value="">Nenhuma</option>{queues.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}</Select></Field>
              <Field label="Atendente responsável" htmlFor={`tr-u-${r.key}`}><Select id={`tr-u-${r.key}`} value={r.userId} onChange={(e) => upd(i, { userId: e.target.value })}><option value="">Nenhum</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
            </div>
            <Field label="Palavras (separadas por vírgula)" htmlFor={`tr-k-${r.key}`}><Textarea id={`tr-k-${r.key}`} rows={2} maxLength={1000} value={r.keywords} onChange={(e) => upd(i, { keywords: e.target.value })} /></Field>
          </fieldset>
        );
      })}
      <Button loading={pending} onClick={submit}>Criar regras (desligadas)</Button>
    </div>
  );
}
