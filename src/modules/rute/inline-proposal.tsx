"use client";
import { useCallback, useEffect, useState } from "react";
import { proposalPanelAction } from "./actions";
import { ProposalCard, type ProposalItem } from "./rute-ui";

export function InlineProposal({ id }: { id: string }) {
  const [item, setItem] = useState<ProposalItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const load = useCallback(async () => {
    try {
      const r = await proposalPanelAction(id);
      if (!r.ok || !r.data) { setError(r.message ?? "Não foi possível consultar a proposta."); return; }
      setItem(r.data); setError(null); setRevision(n => n + 1);
    } catch { setError("Não foi possível consultar a proposta. Tente novamente."); }
  }, [id]);
  useEffect(() => {
    let active = true;
    void proposalPanelAction(id).then(r => {
      if (!active) return;
      if (!r.ok || !r.data) setError(r.message ?? "Não foi possível consultar a proposta.");
      else { setItem(r.data); setError(null); }
    }).catch(() => { if (active) setError("Não foi possível consultar a proposta. Tente novamente."); });
    return () => { active = false; };
  }, [id]);
  return <section aria-label="Proposta da RUTE" className="mt-3 min-w-0 rounded-lg border border-border bg-surface px-3">
    {error ? <div role="alert" className="py-3 text-sm"><p>{error}</p><button type="button" onClick={() => void load()} className="mt-2 underline">Atualizar proposta</button></div> : item ? <ul><ProposalCard key={`${id}-${revision}`} p={item} onChanged={() => void load()} /></ul> : <p role="status" className="py-3 text-xs text-muted">Consultando proposta…</p>}
  </section>;
}
