"use client";

import { ActionButton } from "@/components/ui/action-button";
import { setCaseSharingAction, setDocumentSharingAction } from "./actions";

export function CaseShareToggle({ caseId, shared }: { caseId: string; shared: boolean }) {
  return <ActionButton size="sm" variant="secondary" label={shared ? "Parar de compartilhar com o portal" : "Compartilhar com o portal do cliente"} action={() => setCaseSharingAction(caseId, !shared)} />;
}

export function DocumentShareToggle({ documentId, shared }: { documentId: string; shared: boolean }) {
  return <ActionButton size="sm" variant="secondary" label={shared ? "Remover do portal" : "Compartilhar com o portal do cliente"} action={() => setDocumentSharingAction(documentId, !shared)} />;
}
