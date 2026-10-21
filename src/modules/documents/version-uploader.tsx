"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";

/** Envia uma nova versão do documento (o arquivo anterior é preservado no histórico). */
export function VersionUploader({ documentId }: { documentId: string }) {
  const router = useRouter();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const send = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Selecione um arquivo.");
      return;
    }
    setError(null);
    start(async () => {
      try {
        const body = new FormData();
        body.set("file", file);
        if (note.trim()) body.set("note", note.trim());
        const res = await fetch(`/api/documents/${documentId}/versions`, { method: "POST", body });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string; fieldErrors?: Record<string, string[]> };
          setError(json.fieldErrors?.file?.[0] ?? json.fieldErrors?.note?.[0] ?? json.error ?? "Não foi possível enviar a versão.");
          return;
        }
        setNote("");
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } catch {
        setError("Falha de comunicação com o servidor.");
      }
    });
  };

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Field label="Arquivo da nova versão" htmlFor="version-file" hint="Mesmos formatos aceitos no envio · até 8 MB.">
        <input ref={fileRef} id="version-file" type="file" className="block w-full text-sm" accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.pptx,.odt,.doc,.xls,.txt,.csv" />
      </Field>
      <Field label="O que mudou (opcional)" htmlFor="version-note">
        <Input id="version-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button size="sm" loading={pending} onClick={send}>
        <Upload className="h-3.5 w-3.5" aria-hidden /> Enviar nova versão
      </Button>
    </div>
  );
}
