"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { useRun } from "@/modules/kanban/use-run";
import { addLinkedDocumentAction, removeLinkedDocumentAction } from "./linked-actions";

const KIND: Record<string, string> = { GOOGLE_DOCS: "Google Docs", DRIVE: "Google Drive", URL: "Link" };

export type LinkedRow = { id: string; name: string; url: string; kind: string; source: string; when: string };

export function LinkedDocumentsCard({ caseId, rows, canWrite }: { caseId: string; rows: LinkedRow[]; canWrite: boolean }) {
  const [v, setV] = React.useState({ name: "", url: "" });
  const add = useRun();
  const rem = useRun();
  return (
    <Card className="mt-4">
      <CardHeader title="Documentos por link" description="Documentos que ficam em outro lugar (Google Docs, Drive…). O sistema guarda só o link; abrir pede o acesso do próprio serviço." />
      <CardBody>
        {rem.error ? <Alert tone="error">{rem.error}</Alert> : null}
        {rows.length === 0 ? <p className="text-sm text-muted">Nenhum documento por link.</p> : null}
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-text hover:underline">{r.name}</a>
                <p className="text-xs text-muted">{r.when}{r.source === "ASTREA" ? " · importado do Astrea" : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge>{KIND[r.kind] ?? "Link"}</Badge>
                {canWrite ? <Button type="button" variant="ghost" size="sm" loading={rem.pending} onClick={() => rem.run(() => removeLinkedDocumentAction(caseId, r.id))}>Remover</Button> : null}
              </div>
            </li>
          ))}
        </ul>
        {canWrite ? (
          <form className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); add.run(() => addLinkedDocumentAction(caseId, v), "Link adicionado.", () => setV({ name: "", url: "" })); }}>
            <div className="sm:col-span-2">{add.error ? <Alert tone="error">{add.error}</Alert> : null}{add.done ? <Alert tone="success">{add.done}</Alert> : null}</div>
            <Field label="Nome do documento" htmlFor="ld-name"><Input id="ld-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={200} /></Field>
            <Field label="Link (https://…)" htmlFor="ld-url"><Input id="ld-url" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} maxLength={1000} /></Field>
            <div className="sm:col-span-2"><Button type="submit" size="sm" loading={add.pending}>Adicionar link</Button></div>
          </form>
        ) : null}
      </CardBody>
    </Card>
  );
}
