"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Field, Input, Textarea } from "@/components/ui/form";
import { createLetterheadAction, deleteLetterheadAction, updateLetterheadAction } from "./letterhead-actions";
import type { LetterheadFormInput } from "./letterhead-schemas";

export type LetterheadRow = { id: string; name: string; headerText: string | null; footerText: string | null; hasLogo: boolean; showPageNumbers: boolean; isDefault: boolean; active: boolean };

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    r.readAsDataURL(file);
  });

function LetterheadForm({ row, onDone, onCancel }: { row?: LetterheadRow; onDone: () => void; onCancel: () => void }) {
  const [v, setV] = React.useState({
    name: row?.name ?? "",
    headerText: row?.headerText ?? "",
    footerText: row?.footerText ?? "",
    showPageNumbers: row?.showPageNumbers ?? true,
    isDefault: row?.isDefault ?? false,
    active: row?.active ?? true,
  });
  const [logo, setLogo] = React.useState<string | null | undefined>(undefined);
  const [logoName, setLogoName] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErr, setFieldErr] = React.useState<Record<string, string>>({});
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErr({});
    startTransition(async () => {
      const payload: LetterheadFormInput = { ...v, ...(logo !== undefined ? { logoBase64: logo } : {}) };
      const res = row ? await updateLetterheadAction(row.id, payload) : await createLetterheadAction(payload);
      if (!res.ok) {
        setError(res.message ?? "Não foi possível salvar.");
        setFieldErr(Object.fromEntries(Object.entries(res.fieldErrors ?? {}).map(([k, m]) => [k, m?.[0] ?? ""])));
        return;
      }
      onDone();
    });
  };
  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border border-border bg-surface-2/50 p-3" aria-label={row ? "Editar timbrado" : "Novo timbrado"}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Field label="Nome do timbrado" htmlFor="lh-name" error={fieldErr.name}>
        <Input id="lh-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Cabeçalho (uma linha por linha)" htmlFor="lh-head" error={fieldErr.headerText} hint="Ex.: nome do escritório, OAB, endereço.">
          <Textarea id="lh-head" rows={3} value={v.headerText} onChange={(e) => setV({ ...v, headerText: e.target.value })} />
        </Field>
        <Field label="Rodapé (uma linha por linha)" htmlFor="lh-foot" error={fieldErr.footerText} hint="Ex.: telefone, e-mail, site.">
          <Textarea id="lh-foot" rows={3} value={v.footerText} onChange={(e) => setV({ ...v, footerText: e.target.value })} />
        </Field>
      </div>
      <Field label="Logo (PNG ou JPEG, até 300 KB)" htmlFor="lh-logo" error={fieldErr.logo}>
        <div className="space-y-1">
          <input
            id="lh-logo"
            type="file"
            accept="image/png,image/jpeg"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 300 * 1024) {
                setError("O logo passa de 300 KB.");
                e.target.value = "";
                return;
              }
              setError(null);
              setLogo(await toBase64(f));
              setLogoName(f.name);
            }}
          />
          {logoName ? <p className="text-xs text-muted">Novo logo: {logoName}</p> : row?.hasLogo && logo === undefined ? <p className="text-xs text-muted">Logo atual mantido.</p> : null}
          {row?.hasLogo || logo ? (
            <button type="button" className="text-xs text-danger underline" onClick={() => { setLogo(null); setLogoName(""); }}>
              Remover logo
            </button>
          ) : null}
        </div>
      </Field>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={v.showPageNumbers} onChange={(e) => setV({ ...v, showPageNumbers: e.target.checked })} /> Numerar as páginas</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={v.isDefault} onChange={(e) => setV({ ...v, isDefault: e.target.checked, active: e.target.checked ? true : v.active })} /> Usar como padrão</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={v.active} disabled={v.isDefault} onChange={(e) => setV({ ...v, active: e.target.checked })} /> Ativo</label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending}>{row ? "Salvar" : "Criar timbrado"}</Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>Cancelar</Button>
      </div>
    </form>
  );
}

export function LetterheadManager({ rows, canManage }: { rows: LetterheadRow[]; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<string | "new" | null>(null);
  const done = () => { setEditing(null); router.refresh(); };
  return (
    <Card>
      <CardHeader
        title="Timbrados"
        description="Cabeçalho, rodapé e logo aplicados aos documentos gerados de modelos e à prévia em PDF. O timbrado padrão é usado quando você não escolher outro."
        action={canManage && editing === null ? <Button size="sm" onClick={() => setEditing("new")}>Novo timbrado</Button> : undefined}
      />
      <CardBody className="space-y-3">
        {editing === "new" ? <LetterheadForm onDone={done} onCancel={() => setEditing(null)} /> : null}
        {rows.length === 0 && editing !== "new" ? <p className="text-sm text-muted">Nenhum timbrado cadastrado. Os documentos saem sem cabeçalho nem rodapé.</p> : null}
        <ul className="divide-y divide-border">
          {rows.map((r) =>
            editing === r.id ? (
              <li key={r.id} className="py-3"><LetterheadForm row={r} onDone={done} onCancel={() => setEditing(null)} /></li>
            ) : (
              <li key={r.id} data-testid="letterhead-row" className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {r.name} {r.isDefault ? <Badge tone="success">Padrão</Badge> : null} {!r.active ? <Badge tone="warning">Desativado</Badge> : null} {r.hasLogo ? <Badge>Com logo</Badge> : null}
                  </p>
                  <p className="whitespace-pre-line text-xs text-muted">{[r.headerText, r.footerText].filter(Boolean).join("\n— rodapé —\n") || "Sem textos."}</p>
                </div>
                {canManage ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(r.id)}>Editar</Button>
                    <ConfirmAction label="Excluir" confirmLabel="Excluir timbrado" description="Documentos já gerados não mudam." action={() => deleteLetterheadAction(r.id)} onDone={() => router.refresh()} />
                  </div>
                ) : null}
              </li>
            ),
          )}
        </ul>
      </CardBody>
    </Card>
  );
}
