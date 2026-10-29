"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { reconcileFiledAction, reconcileNotFiledAction } from "./actions";

/**
 * Conferência no tribunal. Uma pessoa abre o sistema do tribunal e registra o que viu:
 *  - protocolada: número do protocolo + o recibo do tribunal (documento já anexado ao processo);
 *  - não protocolada: só assim a petição volta a poder ser enviada.
 * Não há "palpite": sem recibo não existe confirmação oficial.
 */
export function ReconcilePanel({ id, documents, doubt }: { id: string; documents: { id: string; name: string }[]; doubt: boolean }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<"FILED" | "NOT_FILED" | null>(null);
  const [protocol, setProtocol] = React.useState("");
  const [doc, setDoc] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const done = (r: { ok: boolean; message?: string }) => {
    if (!r.ok) return setError(r.message ?? "Não foi possível registrar.");
    setError(null);
    setMode(null);
    router.refresh();
  };

  return (
    <div className="space-y-3" data-testid="reconcile-panel">
      <Alert tone={doubt ? "warning" : "info"}>
        {doubt
          ? "Não temos prova oficial desta petição. Abra o sistema do tribunal e confira se ela foi protocolada. Enquanto isso, o reenvio fica bloqueado para não protocolar em duplicidade."
          : "Já protocolou esta petição direto no sistema do tribunal? Registre aqui o número do protocolo e o recibo para o processo ficar em dia."}
      </Alert>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setMode("FILED")} aria-pressed={mode === "FILED"}>Foi protocolada — registrar recibo</Button>
        {doubt ? <Button variant="secondary" onClick={() => setMode("NOT_FILED")} aria-pressed={mode === "NOT_FILED"}>Conferi: não foi protocolada</Button> : null}
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {mode === "FILED" ? (
        <div className="max-w-md space-y-2">
          <Field label="Número do protocolo (como no recibo)" htmlFor="rc-protocol"><Input id="rc-protocol" value={protocol} onChange={(e) => setProtocol(e.target.value)} autoComplete="off" /></Field>
          <Field label="Recibo do tribunal" htmlFor="rc-doc" hint="Anexe o recibo (PDF) aos documentos do processo e escolha-o aqui.">
            <Select id="rc-doc" value={doc} onChange={(e) => setDoc(e.target.value)}>
              <option value="">Escolha o documento do recibo…</option>
              {documents.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Observação (opcional)" htmlFor="rc-note"><Textarea id="rc-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <Button loading={pending} disabled={!protocol.trim() || !doc} onClick={() => start(async () => done(await reconcileFiledAction(id, { protocol, receiptDocumentId: doc, note: note || undefined })))}>Registrar protocolo</Button>
        </div>
      ) : null}
      {mode === "NOT_FILED" ? (
        <div className="max-w-md space-y-2">
          <Field label="Como e onde você conferiu?" htmlFor="rc-nf" hint="Ex.: “Consultei o processo no PJe do TRF3 em 28/10; não consta a petição.”"><Textarea id="rc-nf" rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <Button variant="danger" loading={pending} disabled={note.trim().length < 10} onClick={() => start(async () => done(await reconcileNotFiledAction(id, { note })))}>Confirmar que não foi protocolada</Button>
        </div>
      ) : null}
    </div>
  );
}
