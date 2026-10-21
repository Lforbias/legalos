"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { addAttachmentAction, classifyAttachmentAction, moveAttachmentAction, removeAttachmentAction } from "./actions";
import { ATTACHMENT_CLASS_LABEL, type AttachmentClassKey } from "./schemas";

export type AttachmentRow = { id: string; documentId: string; name: string; version: number; classification: AttachmentClassKey; stale: boolean };
export type DocOption = { id: string; name: string };

const CLASS_OPTIONS = Object.entries(ATTACHMENT_CLASS_LABEL) as [AttachmentClassKey, string][];

export function PetitionAttachments({ petitionId, rows, options, editable }: { petitionId: string; rows: AttachmentRow[]; options: DocOption[]; editable: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [docId, setDocId] = React.useState("");
  const [cls, setCls] = React.useState<AttachmentClassKey>("OUTROS");

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.message ?? "Não foi possível concluir a operação.");
      else router.refresh();
    });

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {rows.length === 0 ? <p className="text-sm text-muted">Nenhum anexo. {editable ? "Escolha abaixo os documentos do processo que vão junto da petição." : ""}</p> : (
        <ol className="space-y-2" aria-label="Anexos da petição">
          {rows.map((a, i) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-sm">
              <span className="w-6 text-muted">{i + 1}.</span>
              <a className="min-w-0 flex-1 truncate text-primary-text hover:underline" href={`/api/documents/${a.documentId}?v=${a.version}`}>{a.name}</a>
              <Badge>v{a.version}</Badge>
              {a.stale ? <Badge tone="warning">versão mudou</Badge> : null}
              {editable ? (
                <>
                  <Select aria-label={`Classificação de ${a.name}`} value={a.classification} disabled={pending} onChange={(e) => run(() => classifyAttachmentAction(petitionId, a.id, e.target.value))} className="w-56">
                    {CLASS_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </Select>
                  <Button size="sm" variant="ghost" aria-label={`Subir ${a.name}`} disabled={pending || i === 0} onClick={() => run(() => moveAttachmentAction(petitionId, a.id, "up"))}><ArrowUp className="h-4 w-4" aria-hidden /></Button>
                  <Button size="sm" variant="ghost" aria-label={`Descer ${a.name}`} disabled={pending || i === rows.length - 1} onClick={() => run(() => moveAttachmentAction(petitionId, a.id, "down"))}><ArrowDown className="h-4 w-4" aria-hidden /></Button>
                  <Button size="sm" variant="ghost" aria-label={`Remover ${a.name}`} disabled={pending} onClick={() => run(() => removeAttachmentAction(petitionId, a.id))}><Trash2 className="h-4 w-4" aria-hidden /></Button>
                </>
              ) : (
                <Badge tone="info">{ATTACHMENT_CLASS_LABEL[a.classification]}</Badge>
              )}
            </li>
          ))}
        </ol>
      )}
      {editable ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Documento do processo" htmlFor="att-doc">
            <Select id="att-doc" value={docId} onChange={(e) => setDocId(e.target.value)} className="w-72">
              <option value="">Escolha…</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </Field>
          <Field label="Classificação" htmlFor="att-class">
            <Select id="att-class" value={cls} onChange={(e) => setCls(e.target.value as AttachmentClassKey)} className="w-56">
              {CLASS_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          <Button variant="secondary" loading={pending} disabled={!docId} onClick={() => run(async () => { const r = await addAttachmentAction(petitionId, { documentId: docId, classification: cls }); if (r.ok) setDocId(""); return r; })}>Anexar</Button>
        </div>
      ) : null}
    </div>
  );
}
