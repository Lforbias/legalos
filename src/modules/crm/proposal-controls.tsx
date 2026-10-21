"use client";

import { ActionButton } from "@/components/ui/action-button";
import { acceptProposalAction, rejectProposalAction, sendProposalAction } from "./actions";

export function ProposalControls({ id, status }: { id: string; status: string }) {
  if (status === "DRAFT") return <ActionButton label="Marcar como enviada" size="sm" variant="secondary" action={() => sendProposalAction(id)} />;
  if (status === "SENT")
    return (
      <div className="flex gap-2">
        <ActionButton label="Aceita" size="sm" action={() => acceptProposalAction(id)} />
        <ActionButton label="Recusada" size="sm" variant="secondary" action={() => rejectProposalAction(id)} />
      </div>
    );
  return null;
}
