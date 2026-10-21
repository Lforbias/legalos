"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { setFieldValuesAction, setLabelsAction } from "./actions";
import { labelStyle } from "./label-style";

export type LabelOpt = { id: string; name: string; color: string };
export type FieldOpt = { id: string; name: string; kind: string; options: string[] };

/** Etiquetas e campos personalizados da conversa. Remonta (key) quando os dados do servidor mudam. */
export function MetaPanel({ chatId, labels, selected, fields, values, onMsg }: { chatId: string; labels: LabelOpt[]; selected: string[]; fields: FieldOpt[]; values: Record<string, string>; onMsg: (m: { tone: "error" | "success"; text: string } | null) => void }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [draft, setDraft] = React.useState<Record<string, string>>(values);
  const [open, setOpen] = React.useState(false);
  const fail = (r: { message?: string; fieldErrors?: Record<string, string[] | undefined> }) => {
    const f = r.fieldErrors ? Object.values(r.fieldErrors).flat().filter(Boolean).join(" ") : "";
    onMsg({ tone: "error", text: f || r.message || "Não foi possível salvar." });
  };
  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    start(async () => { const r = await setLabelsAction(chatId, next); if (!r.ok) fail(r); else onMsg(null); router.refresh(); });
  };
  const dirty = fields.some((f) => (draft[f.id] ?? "") !== (values[f.id] ?? ""));
  if (labels.length === 0 && fields.length === 0) return null;
  return (
    <div className="space-y-2 border-b border-border p-3 text-sm" data-testid="wa-meta">
      {labels.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="wa-labels">
          <span className="text-xs text-muted">Etiquetas:</span>
          {labels.map((l) => {
            const on = selected.includes(l.id);
            return (
              <button key={l.id} type="button" disabled={pending} aria-pressed={on} onClick={() => toggle(l.id)} className={`rounded-full border px-2 py-0.5 text-xs ${on ? "font-medium" : "border-dashed opacity-60 hover:opacity-100"}`} style={on ? labelStyle(l.color) : { borderColor: l.color }}>
                {on ? "✓ " : "+ "}{l.name}
              </button>
            );
          })}
        </div>
      ) : null}
      {fields.length > 0 ? (
        <div>
          <button type="button" className="text-xs underline" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Ocultar campos" : `Campos (${fields.filter((f) => values[f.id]).length}/${fields.length} preenchidos)`}</button>
          {open ? (
            <div className="mt-2 grid grid-cols-1 gap-2" data-testid="wa-fields">
              {fields.map((f) => (
                <label key={f.id} className="space-y-0.5 text-xs">
                  <span className="text-muted">{f.name}</span>
                  {f.kind === "SELECT" ? (
                    <Select value={draft[f.id] ?? ""} onChange={(e) => setDraft({ ...draft, [f.id]: e.target.value })} className="h-8 text-sm">
                      <option value="">—</option>
                      {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </Select>
                  ) : (
                    <Input type={f.kind === "DATE" ? "date" : "text"} inputMode={f.kind === "NUMBER" ? "decimal" : undefined} value={draft[f.id] ?? ""} maxLength={500} onChange={(e) => setDraft({ ...draft, [f.id]: e.target.value })} className="h-8 text-sm" />
                  )}
                </label>
              ))}
              <div>
                <Button size="sm" loading={pending} disabled={!dirty} onClick={() => start(async () => {
                  const out: Record<string, string | null> = {};
                  for (const f of fields) if ((draft[f.id] ?? "") !== (values[f.id] ?? "")) out[f.id] = draft[f.id] ?? null;
                  const r = await setFieldValuesAction(chatId, out);
                  if (!r.ok) fail(r); else onMsg({ tone: "success", text: "Campos salvos." });
                  router.refresh();
                })}>Salvar campos</Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
