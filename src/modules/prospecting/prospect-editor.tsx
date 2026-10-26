"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { STAGES, type ProspectEdit } from "./schema";
import { saveProspectAction } from "./actions";

const field = "mt-1 block w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg";
export function ProspectEditor({ initial }: { initial: ProspectEdit }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [blocked, setBlocked] = useState(initial.doNotContact);
  return <form key={initial.version} onSubmit={event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "").trim();
    const coordinate = (key: string) => text(key) ? Number(text(key).replace(",", ".")) : null;
    start(async () => {
      setMessage("");
      const result = await saveProspectAction({ cnpj: initial.cnpj, version: initial.version,
        stage: text("stage"), doNotContact: blocked, contactVerified: form.has("contactVerified"),
        notes: text("notes"), nextContactOn: blocked ? null : text("nextContactOn") || null,
        latitude: coordinate("latitude"), longitude: coordinate("longitude"), locationAccuracy: text("locationAccuracy") || null,
      });
      if (result.ok) { setMessage("Cadastro salvo."); router.refresh(); }
      else setMessage(Object.values(result.fieldErrors ?? {}).flat().filter(Boolean).join(" ") || result.message || "Não foi possível salvar.");
    });
  }} className="space-y-5 rounded-2xl border border-border bg-surface p-6">
    <h2 className="text-lg font-semibold">Acompanhamento comercial</h2>
    <fieldset disabled={pending} className="space-y-5 disabled:opacity-60">
      <label className="block text-xs text-muted">Etapa<select name="stage" defaultValue={initial.stage} className={field}>{Object.entries(STAGES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <label className="flex items-center gap-2 text-sm"><input name="doNotContact" type="checkbox" checked={blocked} onChange={e=>setBlocked(e.target.checked)} />Não contatar este escritório</label>
      {blocked && <p className="text-xs text-muted">Bloqueio registrado. O retorno agendado será removido ao salvar.</p>}
      <label className="flex items-center gap-2 text-sm"><input name="contactVerified" type="checkbox" defaultChecked={initial.contactVerified} />Conferi que o contato pertence ao escritório</label>
      <label className="block text-xs text-muted">Próximo retorno<input name="nextContactOn" type="date" disabled={blocked} defaultValue={initial.nextContactOn ?? ""} className={field} /></label>
      <label className="block text-xs text-muted">Anotações<textarea name="notes" rows={5} maxLength={5000} defaultValue={initial.notes} placeholder="Contexto da oportunidade e próximos passos" className={field} /></label>
      <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-medium">Conferir localização no mapa</summary><p className="mt-3 text-xs leading-relaxed text-muted">Insira coordenadas conferidas para este endereço. Se usar o centro do CEP, indique localização aproximada. Os limites são restritos à região da capital.</p><div className="mt-3 grid grid-cols-2 gap-3"><label className="text-xs text-muted">Latitude<input name="latitude" defaultValue={initial.latitude ?? ""} placeholder="-23.5505" className={field} /></label><label className="text-xs text-muted">Longitude<input name="longitude" defaultValue={initial.longitude ?? ""} placeholder="-46.6333" className={field} /></label></div><label className="mt-3 block text-xs text-muted">Precisão<select name="locationAccuracy" defaultValue={initial.locationAccuracy ?? ""} className={field}><option value="">Sem localização</option><option value="ADDRESS">Endereço conferido</option><option value="POSTAL_CODE">Aproximada por CEP</option></select></label></details>
      <button type="submit" className="rounded-lg bg-fg px-5 py-2.5 text-sm text-bg">{pending ? "Salvando…" : "Salvar acompanhamento"}</button>
    </fieldset>
    {message && <p role="status" className="text-sm">{message}</p>}
  </form>;
}
