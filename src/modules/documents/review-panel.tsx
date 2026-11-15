"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { requestReviewAction, decideReviewAction } from "./review-actions";

type Review = { id: string; version: number; status: string; requestedById: string; note: string | null };
const labels: Record<string, string> = { IN_REVIEW: "Em revisão", APPROVED: "Aprovado", CHANGES_REQUESTED: "Ajustes solicitados", SUPERSEDED: "Substituída por nova versão" };
export function ReviewPanel({ documentId, version, reviews, canWrite, userId }: { documentId: string; version: number; reviews: Review[]; canWrite: boolean; userId: string }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const router = useRouter();
  const current = reviews.find(r => r.status === "IN_REVIEW" && r.version === version);
  const run = (action: () => ReturnType<typeof requestReviewAction>) => {
    setError(undefined);
    start(async () => {
      const result = await action();
      if (!result.ok) setError(result.message);
      else { setNote(""); router.refresh(); }
    });
  };
  return <section className="rounded-xl border border-border bg-surface p-4" aria-label="Revisão interna do documento">
    <h2 className="font-semibold">Revisão e aprovação</h2>
    <p className="my-2 text-sm text-muted">Conferência interna da versão {version}. Uma aprovação vale somente para a versão conferida.</p>
    {error && <p role="alert" className="mb-2 text-sm text-danger">{error}</p>}
    {canWrite && !current && <Button loading={pending} onClick={() => run(() => requestReviewAction(documentId, version))}>Solicitar revisão da versão {version}</Button>}
    {canWrite && current && current.requestedById !== userId && <div className="space-y-2">
      <label className="block text-sm" htmlFor="review-note">Parecer ou ajustes necessários</label>
      <Textarea id="review-note" value={note} onChange={e => setNote(e.target.value)} maxLength={2000} disabled={pending} />
      <div className="flex gap-2">
        <Button loading={pending} onClick={() => run(() => decideReviewAction(current.id, "APPROVED", note))}>Aprovar versão {version}</Button>
        <Button variant="secondary" disabled={pending || !note.trim()} onClick={() => run(() => decideReviewAction(current.id, "CHANGES_REQUESTED", note))}>Solicitar ajustes</Button>
      </div>
    </div>}
    {current?.requestedById === userId && <p className="text-sm text-muted">Aguardando conferência por outra pessoa com acesso ao documento.</p>}
    <ul className="mt-3 divide-y divide-border">
      {reviews.map(r => <li key={r.id} className="py-2 text-sm">v{r.version} · {labels[r.status] ?? r.status}{r.version !== version && " · versão anterior"}{r.note && <p className="mt-1 whitespace-pre-wrap text-muted">{r.note}</p>}</li>)}
    </ul>
  </section>;
}
