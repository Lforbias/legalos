"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { centsToInput } from "@/lib/comercial/format";
import { STAGE_INFO, STAGE_KEYS, type StageKey } from "@/lib/comercial/stages";
import { addMemberAction, importAction, saveAddonAction, saveSettingsAction, updateMemberAction } from "./actions";
import { useRun } from "./use-run";

export function AddonForm({ addon, canEdit }: { addon?: { key: string; name: string; description: string | null; priceCents: number | null; perUser: boolean; active: boolean }; canEdit: boolean }) {
  const { run, pending, error, ok } = useRun();
  const [f, setF] = React.useState({ key: addon?.key ?? "", name: addon?.name ?? "", description: addon?.description ?? "", price: centsToInput(addon?.priceCents), perUser: addon?.perUser ?? false, active: addon?.active ?? true });
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => saveAddonAction({ key: f.key, name: f.name, description: f.description, priceCents: f.price, perUser: f.perUser, active: f.active }), () => { if (!addon) setF({ key: "", name: "", description: "", price: "", perUser: false, active: true }); }, "Salvo."); }}>
      {error ? <Alert tone="error">{error}</Alert> : null}{ok ? <Alert tone="success">{ok}</Alert> : null}
      <div className="grid gap-2 sm:grid-cols-4">
        <Field label="Código" htmlFor={`ad-key-${addon?.key ?? "new"}`}><Input id={`ad-key-${addon?.key ?? "new"}`} value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} disabled={!!addon || !canEdit} placeholder="ex.: rute" /></Field>
        <Field label="Nome" htmlFor={`ad-name-${addon?.key ?? "new"}`}><Input id={`ad-name-${addon?.key ?? "new"}`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} disabled={!canEdit} /></Field>
        <Field label="Preço mensal (R$)" htmlFor={`ad-price-${addon?.key ?? "new"}`}><Input id={`ad-price-${addon?.key ?? "new"}`} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} inputMode="decimal" placeholder="defina o valor" disabled={!canEdit} /></Field>
        <div className="flex items-end gap-3 pb-1 text-sm"><label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={f.perUser} onChange={(e) => setF({ ...f, perUser: e.target.checked })} disabled={!canEdit} /> por usuário</label><label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} disabled={!canEdit} /> ativo</label></div>
      </div>
      <Field label="Descrição" htmlFor={`ad-desc-${addon?.key ?? "new"}`}><Input id={`ad-desc-${addon?.key ?? "new"}`} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} disabled={!canEdit} /></Field>
      {canEdit ? <Button type="submit" size="sm" loading={pending}>{addon ? "Salvar aditivo" : "Criar aditivo"}</Button> : null}
    </form>
  );
}

export function SettingsForm({ probabilities, daysToClose, churn, canEdit }: { probabilities: Record<StageKey, number>; daysToClose: Record<StageKey, number>; churn: number; canEdit: boolean }) {
  const { run, pending, error, ok } = useRun();
  const [p, setP] = React.useState(Object.fromEntries(STAGE_KEYS.map((k) => [k, String(probabilities[k])])));
  const [d, setD] = React.useState(Object.fromEntries(STAGE_KEYS.map((k) => [k, String(daysToClose[k])])));
  const [c, setC] = React.useState(String(churn));
  const open = STAGE_KEYS.filter((k) => k !== "GANHO" && k !== "PERDIDO");
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => saveSettingsAction({ probabilities: Object.fromEntries(open.map((k) => [k, Number(p[k])])), daysToClose: Object.fromEntries(open.map((k) => [k, Number(d[k])])), churnMonthlyPct: Number(c.replace(",", ".")) }), undefined, "Premissas salvas. A projeção já usa os novos números."); }}>
      {error ? <Alert tone="error">{error}</Alert> : null}{ok ? <Alert tone="success">{ok}</Alert> : null}
      <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm">
        <thead><tr className="text-xs text-muted"><th className="py-1 pr-3 font-medium">Etapa</th><th className="py-1 pr-3 font-medium">Chance de fechar (%)</th><th className="py-1 font-medium">Dias até fechar</th></tr></thead>
        <tbody>{open.map((k) => (
          <tr key={k} className="border-t border-border"><td className="py-1.5 pr-3">{STAGE_INFO[k].label}</td>
            <td className="py-1.5 pr-3"><Input aria-label={`Chance em ${STAGE_INFO[k].label}`} className="h-8 w-24" value={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.value })} inputMode="numeric" disabled={!canEdit} /></td>
            <td className="py-1.5"><Input aria-label={`Dias em ${STAGE_INFO[k].label}`} className="h-8 w-24" value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} inputMode="numeric" disabled={!canEdit} /></td></tr>
        ))}</tbody>
      </table></div>
      <Field label="Cancelamento mensal esperado (churn, %)" htmlFor="st-churn" hint="De cada 100 clientes, quantos saem por mês. Comece com 2% e ajuste com a realidade."><Input id="st-churn" className="w-28" value={c} onChange={(e) => setC(e.target.value)} inputMode="decimal" disabled={!canEdit} /></Field>
      {canEdit ? <Button type="submit" loading={pending}>Salvar premissas</Button> : <p className="text-xs text-muted">Só a gerência altera as premissas.</p>}
    </form>
  );
}

export function AddMember() {
  const { run, pending, error } = useRun();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState("VENDEDOR");
  return (
    <form className="grid gap-2 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault(); run(() => addMemberAction(email, role), () => setEmail("")); }}>
      <div className="sm:col-span-2"><Field label="E-mail da pessoa (já precisa ter conta no LegalOS)" htmlFor="mb-email"><Input id="mb-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field></div>
      <Field label="Papel" htmlFor="mb-role"><Select id="mb-role" value={role} onChange={(e) => setRole(e.target.value)}><option value="VENDEDOR">Vendas</option><option value="GERENTE">Gerência</option></Select></Field>
      <div className="flex items-end"><Button type="submit" loading={pending} disabled={!email.includes("@")}>Adicionar</Button></div>
      {error ? <div className="sm:col-span-4"><Alert tone="error">{error}</Alert></div> : null}
    </form>
  );
}

export function MemberRow({ m, self }: { m: { userId: string; name: string; email: string; role: string; active: boolean; goalMonthlyCents: number | null; mfa: boolean }; self: boolean }) {
  const { run, pending, error } = useRun();
  const [goal, setGoal] = React.useState(centsToInput(m.goalMonthlyCents));
  return (
    <tr className="border-t border-border align-top">
      <td className="py-2 pr-3"><p className="font-medium">{m.name}</p><p className="text-xs text-muted">{m.email}{m.mfa ? "" : " · sem 2FA (não consegue entrar)"}</p>{error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}</td>
      <td className="py-2 pr-3"><Select aria-label="Papel" className="h-8 text-xs" value={m.role} disabled={pending || self} onChange={(e) => run(() => updateMemberAction(m.userId, { role: e.target.value }))}><option value="VENDEDOR">Vendas</option><option value="GERENTE">Gerência</option></Select></td>
      <td className="py-2 pr-3"><div className="flex gap-1.5"><Input aria-label="Meta mensal" className="h-8 w-32 text-xs" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="R$ por mês" inputMode="decimal" /><Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => updateMemberAction(m.userId, { goal }))}>Salvar</Button></div></td>
      <td className="py-2"><Button size="sm" variant={m.active ? "ghost" : "secondary"} loading={pending} disabled={self} onClick={() => run(() => updateMemberAction(m.userId, { active: !m.active }))}>{m.active ? "Desativar" : "Reativar"}</Button></td>
    </tr>
  );
}

export function ImportForm() {
  const { run, pending, error } = useRun();
  const [text, setText] = React.useState("");
  const [enrich, setEnrich] = React.useState(true);
  const [res, setRes] = React.useState<{ created: number; updated: number; enriched: number; notes: string[]; errors: string[] } | null>(null);
  return (
    <div className="space-y-3">
      <Field label="Planilha (CSV)" htmlFor="im-text" hint="Primeira linha com os nomes das colunas. Aceita: nome, cnpj, telefone, email, site, ranking, fonte, advogados, areas, tags, rua, numero, bairro, cep. Pode colar direto do Excel salvo como CSV (separador , ou ;).">
        <Textarea id="im-text" value={text} onChange={(e) => setText(e.target.value)} className="min-h-48 font-mono text-xs" placeholder={"nome;cnpj;ranking;fonte\nExemplo Advogados;00.000.000/0001-91;1;Ranking X 2026"} />
      </Field>
      <input type="file" accept=".csv,text/csv,text/plain" aria-label="Escolher arquivo CSV" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} className="text-sm" />
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={enrich} onChange={(e) => setEnrich(e.target.checked)} /> <span>Buscar os dados de cada CNPJ na Receita e localizar no mapa. É mais lento (cerca de 1 segundo por escritório); para listas grandes, importe em partes de 50 a 100.</span></label>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Button loading={pending} disabled={text.trim().length < 5} onClick={() => run(() => importAction(text, enrich), (d) => d && setRes(d))}>Importar</Button>
      {res ? (
        <div className="space-y-1 rounded-md border border-border bg-surface-2 p-3 text-sm">
          <p>{res.created} novos · {res.updated} atualizados · {res.enriched} consultados na Receita.</p>
          {res.errors.map((x) => <p key={x} className="text-xs text-danger">{x}</p>)}
          {res.notes.map((x) => <p key={x} className="text-xs text-warning">{x}</p>)}
        </div>
      ) : null}
    </div>
  );
}
