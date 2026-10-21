"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { decideClassificationAction, suggestBatchAction, suggestClassificationAction } from "./classify-actions";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABEL, type DocumentCategory } from "./schemas";

export type SuggestionRow = { id: string; documentId: string; documentName: string; suggested: DocumentCategory; confidence: number; reason: string | null; stale: boolean };

export function SuggestionItem({ s, showName = true }: { s: SuggestionRow; showName?: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [pick, setPick] = React.useState<string>(s.suggested);
  const run = (input: unknown) =>
    start(async () => {
      const r = await decideClassificationAction(s.id, s.documentId, input);
      if (!r.ok) setError(r.message ?? "Não foi possível salvar.");
      else {
        setError(null);
        router.refresh();
      }
    });
  return (
    <div className="space-y-2 text-sm" data-testid="classification-suggestion">
      {showName ? <p className="font-medium">{s.documentName}</p> : null}
      <p>
        Sugestão da IA: <Badge tone={s.confidence >= 70 ? "success" : "warning"}>{DOCUMENT_CATEGORY_LABEL[s.suggested]}</Badge> <span className="text-xs text-muted">confiança {s.confidence}%</span>
      </p>
      {s.reason ? <p className="text-xs text-muted">{s.reason}</p> : null}
      {s.stale ? <p className="text-xs text-warning">O documento recebeu nova versão depois desta sugestão.</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" loading={pending} onClick={() => run({ action: "accept" })}>Aceitar</Button>
        <Select aria-label="Corrigir categoria" value={pick} onChange={(e) => setPick(e.target.value)} className="w-48">
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>{DOCUMENT_CATEGORY_LABEL[c]}</option>
          ))}
        </Select>
        <Button size="sm" variant="secondary" loading={pending} disabled={pick === s.suggested} onClick={() => run({ action: "correct", category: pick })}>Usar esta</Button>
        <Button size="sm" variant="ghost" loading={pending} onClick={() => run({ action: "dismiss" })}>Descartar</Button>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function SuggestOneButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div className="space-y-2">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await suggestClassificationAction(documentId);
            if (!r.ok) setError(r.message ?? "Não foi possível pedir a sugestão.");
            else {
              setError(null);
              router.refresh();
            }
          })
        }
      >
        Pedir sugestão de categoria à IA
      </Button>
    </div>
  );
}

export function SuggestBatchButton() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<{ tone: "success" | "error"; text: string } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await suggestBatchAction();
            if (!r.ok || !r.data) setMsg({ tone: "error", text: r.message ?? "Não foi possível pedir as sugestões." });
            else {
              setMsg({ tone: r.data.stoppedBecause ? "error" : "success", text: `${r.data.suggested} sugestão(ões) nova(s)${r.data.stoppedBecause ? `. Parou: ${r.data.stoppedBecause}` : "."}` });
              router.refresh();
            }
          })
        }
      >
        Sugerir para documentos sem categoria (10 por vez)
      </Button>
      {msg ? <span role="status" className={msg.tone === "error" ? "text-xs text-danger" : "text-xs text-muted"}>{msg.text}</span> : null}
    </div>
  );
}
