"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { centsToInput, toInputDate, toInputDateTime } from "@/lib/comercial/format";
import { enrichAction, geocodeAction, updateProspectAction } from "./actions";
import { useRun } from "./use-run";

export type ProspectFormData = {
  id: string; name: string; cnpj: string | null; legalName: string | null; phone: string | null; phone2: string | null; whatsapp: string | null; email: string | null; website: string | null;
  street: string | null; number: string | null; complement: string | null; district: string | null; city: string; state: string; zip: string | null;
  lawyersEstimate: number | null; areas: string[]; tags: string[]; rankingPosition: number | null; rankingSource: string | null; ownerId: string | null;
  planKey: string | null; expectedUsers: number | null; expectedMonthlyCents: number | null; probabilityPct: number | null; expectedCloseAt: Date | null; nextActionAt: Date | null; nextActionNote: string | null; notes: string | null; doNotContact: boolean; contactVerified: boolean;
};

export function ProspectForm({ p, owners, plans }: { p: ProspectFormData; owners: { id: string; name: string }[]; plans: { key: string; name: string }[] }) {
  const { run, pending, error, ok } = useRun();
  const [f, setF] = React.useState({
    name: p.name, cnpj: p.cnpj ?? "", legalName: p.legalName ?? "", phone: p.phone ?? "", phone2: p.phone2 ?? "", whatsapp: p.whatsapp ?? "", email: p.email ?? "", website: p.website ?? "",
    street: p.street ?? "", number: p.number ?? "", complement: p.complement ?? "", district: p.district ?? "", city: p.city, state: p.state, zip: p.zip ?? "",
    lawyersEstimate: p.lawyersEstimate?.toString() ?? "", areas: p.areas.join(", "), tags: p.tags.join(", "), rankingPosition: p.rankingPosition?.toString() ?? "", rankingSource: p.rankingSource ?? "",
    ownerId: p.ownerId ?? "", planKey: p.planKey ?? "", expectedUsers: p.expectedUsers?.toString() ?? "", expectedMonthlyCents: centsToInput(p.expectedMonthlyCents), probabilityPct: p.probabilityPct?.toString() ?? "",
    expectedCloseAt: toInputDate(p.expectedCloseAt), nextActionAt: toInputDateTime(p.nextActionAt), nextActionNote: p.nextActionNote ?? "", notes: p.notes ?? "",
  });
  const [flags, setFlags] = React.useState({ doNotContact: p.doNotContact, contactVerified: p.contactVerified });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const inp = (k: keyof typeof f, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label} htmlFor={`pf-${k}`}><Input id={`pf-${k}`} value={f[k]} onChange={set(k)} {...extra} /></Field>
  );
  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); run(() => updateProspectAction(p.id, { ...f, ...flags, expectedMonthlyCents: f.expectedMonthlyCents, expectedCloseAt: f.expectedCloseAt || null, nextActionAt: f.nextActionAt ? new Date(f.nextActionAt).toISOString() : null }), undefined, "Salvo."); }}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {ok ? <Alert tone="success">{ok}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {inp("name", "Nome do escritório")}{inp("legalName", "Razão social")}{inp("cnpj", "CNPJ", { placeholder: "00.000.000/0000-00" })}
        {inp("phone", "Telefone")}{inp("phone2", "Telefone 2")}{inp("whatsapp", "WhatsApp")}
        {inp("email", "E-mail", { type: "email" })}{inp("website", "Site")}{inp("lawyersEstimate", "Nº estimado de advogados", { inputMode: "numeric" })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">{inp("street", "Rua / avenida")}</div>{inp("number", "Número")}{inp("complement", "Complemento")}
        {inp("district", "Bairro")}{inp("city", "Cidade")}{inp("state", "UF", { maxLength: 2 })}{inp("zip", "CEP", { inputMode: "numeric" })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {inp("rankingPosition", "Posição na lista dos 100", { inputMode: "numeric" })}{inp("rankingSource", "Fonte do ranking")}{inp("areas", "Áreas (separe por vírgula)")}{inp("tags", "Etiquetas (vírgula)")}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Responsável" htmlFor="pf-owner"><Select id="pf-owner" value={f.ownerId} onChange={set("ownerId")}><option value="">Sem responsável</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
        <Field label="Plano previsto" htmlFor="pf-plan"><Select id="pf-plan" value={f.planKey} onChange={set("planKey")}><option value="">—</option>{plans.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}</Select></Field>
        {inp("expectedUsers", "Usuários previstos", { inputMode: "numeric" })}{inp("expectedMonthlyCents", "Valor mensal previsto (R$)", { inputMode: "decimal" })}
        {inp("probabilityPct", "Chance de fechar (%) — vazio usa a da etapa", { inputMode: "numeric" })}{inp("expectedCloseAt", "Fechamento previsto", { type: "date" })}{inp("nextActionAt", "Próximo retorno", { type: "datetime-local" })}{inp("nextActionNote", "O que fazer no retorno")}
      </div>
      <div className="space-y-2 rounded-md border border-border p-3 text-sm">
        <label className="flex items-start gap-2"><input type="checkbox" checked={flags.doNotContact} onChange={(e) => setFlags((s) => ({ ...s, doNotContact: e.target.checked }))} className="mt-0.5" /><span><strong>Não contatar</strong> — o escritório pediu para não ser procurado (ou o telefone não é dele). Some dos retornos e só aceita anotações.</span></label>
        <label className="flex items-start gap-2"><input type="checkbox" checked={flags.contactVerified} onChange={(e) => setFlags((s) => ({ ...s, contactVerified: e.target.checked }))} className="mt-0.5" /><span><strong>Contato conferido</strong> — alguém do time confirmou que o telefone/e-mail é do escritório e não de um contador.</span></label>
      </div>
      <Field label="Anotações" htmlFor="pf-notes"><Textarea id="pf-notes" value={f.notes} onChange={set("notes")} /></Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending}>Salvar</Button>
        <Button type="button" variant="secondary" loading={pending} disabled={!p.cnpj} onClick={() => run(() => enrichAction(p.id), undefined, "Dados atualizados pela Receita.")}>Atualizar pelo CNPJ</Button>
        <Button type="button" variant="secondary" loading={pending} onClick={() => run(() => geocodeAction(p.id), undefined, result => result?.found ? "Localização encontrada. Veja o mapa." : "Endereço não encontrado. Confira rua, número e CEP.")}>Refazer ponto no mapa</Button>
      </div>
    </form>
  );
}
