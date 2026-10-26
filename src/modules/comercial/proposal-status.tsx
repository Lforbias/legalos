"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteProspectAction, setProposalStatusAction } from "./actions";
import { useRun } from "./use-run";

export function ProposalStatusButtons({ prospectId, proposalId, status }: { prospectId: string; proposalId: string; status: string }) {
  const { run, pending, error } = useRun();
  if (status === "ACEITA" || status === "RECUSADA") return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {status === "RASCUNHO" ? <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => setProposalStatusAction(prospectId, proposalId, "ENVIADA"))}>Marcar como enviada</Button> : null}
      <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => setProposalStatusAction(prospectId, proposalId, "ACEITA"))}>Aceita</Button>
      <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => setProposalStatusAction(prospectId, proposalId, "RECUSADA"))}>Recusada</Button>
      {error ? <span role="alert" className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}

export function DeleteProspect({ id }: { id: string }) {
  const router = useRouter();
  const { run, pending, error } = useRun();
  return (
    <div className="space-y-1">
      <Button size="sm" variant="danger" loading={pending} onClick={() => { if (window.confirm("Remover este escritório da lista? O histórico some junto da tela.")) run(() => deleteProspectAction(id), () => router.push("/comercial/escritorios")); }}>Remover escritório</Button>
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
