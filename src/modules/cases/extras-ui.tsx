"use client";

import { Pin, PinOff } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { formatDateTime } from "@/lib/dates/format";
import {
  addCaseNoteItemAction,
  bulkNoteAction,
  createCustomFieldAction,
  deleteNoteItemAction,
  pinNoteAction,
  saveCustomValuesAction,
  setAcervoAction,
  toggleCustomFieldAction,
} from "./extras-actions";
import { BULK_NOTE_MAX, CUSTOM_FIELD_TYPES, CUSTOM_FIELD_TYPE_LABEL, caseNoteSchema, customFieldDefSchema, type CaseNoteInput, type CustomFieldDefInput } from "./extras-schemas";

// ---------- acervo ----------

export function AcervoButton({ caseId, inAcervo }: { caseId: string; inAcervo: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Button
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await setAcervoAction(caseId, !inAcervo);
            if (!res.ok) setError(res.message ?? "Não foi possível mover o processo.");
            router.refresh();
          });
        }}
      >
        {inAcervo ? "Devolver à carteira ativa" : "Mover para o acervo"}
      </Button>
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
      <p className="text-xs text-muted">{inAcervo ? "Este processo está no acervo (fora da carteira ativa)." : "O acervo guarda processos sem excluí-los; eles saem da lista principal."}</p>
    </div>
  );
}

// ---------- notas fixas ----------

export type NoteRow = { id: string; title: string | null; body: string; pinned: boolean; authorName: string | null; createdAt: string; bulk: boolean };

export function CaseNotesPanel({ caseId, notes, canWrite, tz }: { caseId: string; notes: NoteRow[]; canWrite: boolean; tz: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const { form, submit, pending: saving, message } = useServerForm<CaseNoteInput, undefined>({
    schema: caseNoteSchema,
    defaultValues: { title: "", body: "", pinned: false },
    action: (v) => addCaseNoteItemAction(caseId, v),
    onSuccess: (_d, f) => {
      f.reset();
      router.refresh();
    },
  });
  const err = (n: keyof CaseNoteInput) => fieldError(form, n);
  return (
    <div className="space-y-4">
      {canWrite ? (
        <Card>
          <CardHeader title="Nova nota" description="Nota interna do processo. Fixe as importantes para que fiquem no topo." />
          <CardBody>
            <form onSubmit={submit} noValidate className="space-y-3" aria-label="Nova nota do processo">
              {message ? <Alert tone="error">{message}</Alert> : null}
              <Field label="Título (opcional)" htmlFor="cn-title" error={err("title")}>
                <Input id="cn-title" {...form.register("title")} />
              </Field>
              <Field label="Nota" htmlFor="cn-body" error={err("body")}>
                <Textarea id="cn-body" rows={3} {...form.register("body")} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...form.register("pinned")} /> Fixar no topo
              </label>
              <Button type="submit" size="sm" loading={saving}>Salvar nota</Button>
            </form>
          </CardBody>
        </Card>
      ) : null}
      <Card>
        <CardHeader title="Notas do processo" />
        <CardBody>
          {notes.length === 0 ? <p className="text-sm text-muted">Nenhuma nota neste processo.</p> : null}
          <ul className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} data-testid="case-note" className={n.pinned ? "rounded-md border border-warning/40 bg-warning/5 p-3" : "rounded-md border border-border p-3"}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {n.pinned ? <Pin className="h-3.5 w-3.5 text-warning" aria-label="Fixada" /> : null}
                    {n.title || "Nota"}
                    {n.bulk ? <Badge>Aplicada em lote</Badge> : null}
                  </p>
                  {canWrite ? (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => startTransition(async () => { await pinNoteAction(n.id, !n.pinned); router.refresh(); })}
                      >
                        {n.pinned ? <><PinOff className="mr-1 h-3.5 w-3.5" aria-hidden /> Desafixar</> : <><Pin className="mr-1 h-3.5 w-3.5" aria-hidden /> Fixar</>}
                      </Button>
                      <ConfirmAction label="Excluir" confirmLabel="Excluir nota" action={() => deleteNoteItemAction(n.id)} onDone={() => router.refresh()} />
                    </div>
                  ) : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>
                <p className="mt-1 text-xs text-muted">{n.authorName ?? "Sistema"} · {formatDateTime(new Date(n.createdAt), tz)}</p>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

// ---------- campos personalizados (valores no processo) ----------

export type FieldDefRow = { key: string; label: string; type: string; options: string[] };

export function CustomValuesCard({ caseId, defs, values, canWrite }: { caseId: string; defs: FieldDefRow[]; values: Record<string, string>; canWrite: boolean }) {
  const router = useRouter();
  const [state, setState] = React.useState<Record<string, string>>(() => Object.fromEntries(defs.map((d) => [d.key, values[d.key] ?? ""])));
  const [pending, startTransition] = React.useTransition();
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  if (defs.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Campos personalizados" description="Campos definidos pelo escritório em Configurações." />
      <CardBody>
        <form
          className="space-y-3"
          aria-label="Campos personalizados"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg(null);
            setErrors({});
            startTransition(async () => {
              const res = await saveCustomValuesAction(caseId, state);
              if (!res.ok) {
                setMsg({ ok: false, text: res.message ?? "Não foi possível salvar." });
                setErrors(Object.fromEntries(Object.entries(res.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0] ?? ""])));
                return;
              }
              setMsg({ ok: true, text: "Campos salvos." });
              router.refresh();
            });
          }}
        >
          {msg ? <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert> : null}
          {defs.map((d) => (
            <Field key={d.key} label={d.label} htmlFor={`cf-${d.key}`} error={errors[d.key]}>
              {d.type === "SELECT" ? (
                <Select id={`cf-${d.key}`} disabled={!canWrite} value={state[d.key] ?? ""} onChange={(e) => setState((s) => ({ ...s, [d.key]: e.target.value }))}>
                  <option value="">—</option>
                  {d.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </Select>
              ) : (
                <Input id={`cf-${d.key}`} type={d.type === "DATE" ? "date" : "text"} inputMode={d.type === "NUMBER" ? "decimal" : undefined} disabled={!canWrite} value={state[d.key] ?? ""} onChange={(e) => setState((s) => ({ ...s, [d.key]: e.target.value }))} />
              )}
            </Field>
          ))}
          {canWrite ? <Button type="submit" size="sm" loading={pending}>Salvar campos</Button> : null}
        </form>
      </CardBody>
    </Card>
  );
}

// ---------- campos personalizados (administração) ----------

export type FieldAdminRow = { id: string; label: string; type: string; options: string[]; active: boolean };

export function CustomFieldsAdmin({ rows, canEdit }: { rows: FieldAdminRow[]; canEdit: boolean }) {
  const router = useRouter();
  const { form, submit, pending, message } = useServerForm<CustomFieldDefInput, undefined>({
    schema: customFieldDefSchema,
    defaultValues: { label: "", type: "TEXT", options: "" },
    action: (v) => createCustomFieldAction(v),
    onSuccess: (_d, f) => {
      f.reset();
      router.refresh();
    },
  });
  const type = form.watch("type");
  const err = (n: keyof CustomFieldDefInput) => fieldError(form, n);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Campos personalizados de processo" description="Aparecem na página de cada processo. Desativar um campo o esconde, mas guarda os valores já preenchidos." />
        <CardBody>
          {rows.length === 0 ? <p className="text-sm text-muted">Nenhum campo criado ainda.</p> : null}
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} data-testid="custom-field-row" className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {r.label} <Badge>{CUSTOM_FIELD_TYPE_LABEL[r.type as (typeof CUSTOM_FIELD_TYPES)[number]]}</Badge>
                    {!r.active ? <Badge tone="warning">Desativado</Badge> : null}
                  </p>
                  {r.options.length ? <p className="text-xs text-muted">{r.options.join(" · ")}</p> : null}
                </div>
                {canEdit ? (
                  <ConfirmAction label={r.active ? "Desativar" : "Reativar"} confirmLabel={r.active ? "Desativar campo" : "Reativar campo"} action={() => toggleCustomFieldAction(r.id, !r.active)} onDone={() => router.refresh()} />
                ) : null}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
      {canEdit ? (
        <Card>
          <CardHeader title="Novo campo" />
          <CardBody>
            <form onSubmit={submit} noValidate className="space-y-3" aria-label="Novo campo personalizado">
              {message ? <Alert tone="error">{message}</Alert> : null}
              <Field label="Nome do campo" htmlFor="cfd-label" error={err("label")}>
                <Input id="cfd-label" {...form.register("label")} />
              </Field>
              <Field label="Tipo" htmlFor="cfd-type" error={err("type")}>
                <Select id="cfd-type" {...form.register("type")}>
                  {CUSTOM_FIELD_TYPES.map((t) => <option key={t} value={t}>{CUSTOM_FIELD_TYPE_LABEL[t]}</option>)}
                </Select>
              </Field>
              {type === "SELECT" ? (
                <Field label="Opções (uma por linha)" htmlFor="cfd-options" error={err("options")}>
                  <Textarea id="cfd-options" rows={4} {...form.register("options")} />
                </Field>
              ) : null}
              <Button type="submit" size="sm" loading={pending}>Criar campo</Button>
            </form>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

// ---------- nota em lote ----------

export type CaseOption = { id: string; label: string };

export function BulkNoteForm({ options }: { options: CaseOption[] }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [pending, startTransition] = React.useTransition();
  const [form, setForm] = React.useState({ title: "", body: "", pinned: false });
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= BULK_NOTE_MAX ? s : [...s, id]));
  return (
    <form
      className="space-y-4"
      aria-label="Nota em lote"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        startTransition(async () => {
          const res = await bulkNoteAction({ ...form, caseIds: selected });
          if (!res.ok) {
            setMsg({ ok: false, text: res.message ?? "Não foi possível aplicar a nota." });
            return;
          }
          setMsg({ ok: true, text: `Nota aplicada em ${res.data?.count ?? selected.length} processo(s).` });
          setSelected([]);
          setForm({ title: "", body: "", pinned: false });
          router.refresh();
        });
      }}
    >
      {msg ? <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert> : null}
      <Card>
        <CardHeader title="Processos" description={`Marque até ${BULK_NOTE_MAX} processos. Selecionados: ${selected.length}.`} />
        <CardBody>
          {options.length === 0 ? <p className="text-sm text-muted">Nenhum processo encontrado.</p> : null}
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {options.map((o) => (
              <li key={o.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-surface-2">
                  <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} disabled={!selected.includes(o.id) && selected.length >= BULK_NOTE_MAX} />
                  <span className="truncate">{o.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Nota" />
        <CardBody className="space-y-3">
          <Field label="Título (opcional)" htmlFor="bn-title">
            <Input id="bn-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </Field>
          <Field label="Nota" htmlFor="bn-body">
            <Textarea id="bn-body" rows={4} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.pinned} onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))} /> Fixar no topo de cada processo
          </label>
          <Button type="submit" loading={pending} disabled={selected.length === 0 || form.body.trim().length < 2}>
            Aplicar em {selected.length} processo(s)
          </Button>
        </CardBody>
      </Card>
    </form>
  );
}
