"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { extractDocumentTextAction, extractPendingTextsAction } from "./actions";

const LABEL = { EXTRACTED: "Texto extraído", EMPTY: "Sem texto reconhecido", UNAVAILABLE: "Extração indisponível", FAILED: "Falhou" } as const;
const TONE = { EXTRACTED: "success", EMPTY: "warning", UNAVAILABLE: "warning", FAILED: "danger" } as const;

export type TextInfo = { status: keyof typeof LABEL; method: string | null; pages: number | null; error: string | null; chars: number; preview: string } | null;

export function TextPanel({ documentId, info, canWrite }: { documentId: string; info: TextInfo; canWrite: boolean }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {info ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={TONE[info.status]} data-testid="text-status">{LABEL[info.status]}</Badge>
          {info.method ? <span className="text-xs text-muted">{info.method === "pdf-text" ? "texto do PDF" : info.method.startsWith("ocr") ? `OCR (${info.method.slice(4)})` : info.method}</span> : null}
          {info.pages ? <span className="text-xs text-muted">{info.pages} pág.</span> : null}
          <span className="text-xs text-muted">{info.chars.toLocaleString("pt-BR")} caracteres</span>
        </div>
      ) : (
        <p className="text-sm text-muted">O texto desta versão ainda não foi extraído. Sem ele, a busca por conteúdo e a IA só enxergam o nome do arquivo.</p>
      )}
      {info?.error ? <Alert tone={info.status === "EXTRACTED" ? "info" : "warning"}>{info.error}</Alert> : null}
      {info?.preview ? (
        <details className="rounded-md border border-border bg-surface-2 p-3">
          <summary className="cursor-pointer text-sm font-medium">Ver início do texto extraído</summary>
          <pre data-testid="text-preview" className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs">{info.preview}</pre>
        </details>
      ) : null}
      {canWrite ? (
        <Button
          type="button"
          variant="secondary"
          loading={pending}
          onClick={() =>
            start(async () => {
              const r = await extractDocumentTextAction(documentId);
              if (!r.ok) setError(r.message ?? "Não foi possível extrair.");
              else {
                setError(null);
                router.refresh();
              }
            })
          }
        >
          {info ? "Extrair de novo" : "Extrair texto (OCR)"}
        </Button>
      ) : null}
    </div>
  );
}

export function ExtractPendingButton() {
  const router = useRouter();
  const [msg, setMsg] = React.useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await extractPendingTextsAction();
            if (!r.ok || !r.data) setMsg({ tone: "error", text: r.message ?? "Não foi possível extrair." });
            else {
              setMsg({ tone: "success", text: r.data.processed === 0 ? "Nada pendente." : `${r.data.processed} processado(s), ${r.data.extracted} com texto, ${r.data.failed} com falha. Restam ${r.data.remaining}.` });
              router.refresh();
            }
          })
        }
      >
        Extrair texto dos pendentes (10 por vez)
      </Button>
      {msg ? <span role="status" className={msg.tone === "error" ? "text-xs text-danger" : "text-xs text-muted"} data-testid="pending-result">{msg.text}</span> : null}
    </div>
  );
}
