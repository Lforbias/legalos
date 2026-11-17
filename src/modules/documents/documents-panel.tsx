"use client";

import { Download, FileText, Search, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { formatDateTime } from "@/lib/dates/format";
import { formatBytes } from "@/lib/format/phone";
import { deleteDocumentAction } from "@/modules/cases/actions";

export type DocumentRow = { id: string; name: string; sizeBytes: number; createdAt: string; currentVersion: number };

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.pptx,.odt,.doc,.xls,.txt,.csv";

/** Documentos do processo/cliente: envio, download autenticado, versões (página do documento) e exclusão lógica. OCR chega na Fase 8. */
export function DocumentsPanel({
  owner,
  documents,
  canWrite,
  timezone,
  revalidate,
  title = "Documentos",
  description = "Arquivos privados do escritório. Formatos: PDF, imagens, Office/OpenDocument, TXT e CSV · até 8 MB.",
  searchable = false,
}: {
  owner: { caseId?: string; clientId?: string };
  documents: DocumentRow[];
  canWrite: boolean;
  timezone: string;
  revalidate: string;
  title?: string;
  description?: string;
  searchable?: boolean;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const visibleDocuments = documents.filter((document) => document.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const inputId = owner.caseId ? "document-file" : `document-file-${owner.clientId ?? "repository"}`;

  const upload = (file: File) => {
    setError(null);
    startTransition(async () => {
      try {
        const body = new FormData();
        body.set("file", file);
        if (owner.caseId) body.set("caseId", owner.caseId);
        if (owner.clientId) body.set("clientId", owner.clientId);
        const res = await fetch("/api/documents", { method: "POST", body });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string; fieldErrors?: Record<string, string[]> };
          setError(json.fieldErrors?.file?.[0] ?? json.error ?? "Não foi possível enviar o arquivo.");
          return;
        }
        router.refresh();
      } catch {
        setError("Falha de comunicação com o servidor.");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  };

  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        action={
          canWrite ? (
            <div className="flex items-center gap-2">
              <Link href={owner.caseId ? `/documentos/gerar?processo=${owner.caseId}` : `/documentos/gerar?cliente=${owner.clientId}`} className="inline-flex h-8 items-center rounded-md border border-border bg-surface-2 px-3 text-sm hover:bg-surface-3">Gerar de modelo</Link>
              <input
                ref={inputRef}
                id={inputId}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f);
                }}
              />
              <Button size="sm" variant="secondary" loading={pending} onClick={() => inputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" aria-hidden /> Enviar arquivo
              </Button>
            </div>
          ) : undefined
        }
      />
      <CardBody className="space-y-3">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {searchable && documents.length > 0 ? (
          <label className="relative block max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar nesta pasta"
              aria-label={`Buscar em ${title}`}
              className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </label>
        ) : null}
        {documents.length === 0 ? <p className="text-sm text-muted">Nenhum documento anexado.</p> : null}
        {documents.length > 0 && visibleDocuments.length === 0 ? <p className="text-sm text-muted">Nenhum documento corresponde à busca.</p> : null}
        <ul className="divide-y divide-border">
          {visibleDocuments.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                <div className="min-w-0">
                  <p className="truncate text-sm"><Link href={`/documentos/${d.id}`} className="text-primary-text hover:underline">{d.name}</Link>{d.currentVersion > 1 ? <span className="ml-1.5 text-xs text-muted">v{d.currentVersion}</span> : null}</p>
                  <p className="text-xs text-muted">
                    {formatBytes(d.sizeBytes)} · {formatDateTime(d.createdAt, timezone)}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <a
                  href={`/api/documents/${d.id}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 text-sm hover:bg-surface-3"
                  aria-label={`Baixar ${d.name}`}
                >
                  <Download className="h-3.5 w-3.5" aria-hidden /> Baixar
                </a>
                {canWrite ? (
                  <ConfirmAction
                    label="Excluir"
                    confirmLabel="Excluir documento"
                    description="O documento deixa de aparecer; o arquivo é mantido em armazenamento para fins de auditoria."
                    action={() => deleteDocumentAction(d.id, revalidate)}
                    onDone={() => router.refresh()}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
