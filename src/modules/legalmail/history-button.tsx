"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { syncLegalMailHistoryAction } from "./actions";

export function LegalMailHistoryButton({ caseId }: { caseId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ message: string; showTimeline?: boolean } | null>(null);
  return (
    <div className="space-y-1">
      <Button variant="secondary" loading={pending} onClick={() => start(async () => {
        setResult(null);
        const response = await syncLegalMailHistoryAction(caseId);
        if (!response.ok || !response.data) {
          setResult({ message: response.message ?? "Não foi possível consultar o LegalMail." });
          return;
        }
        const { found, total, imported } = response.data;
        if (!found) setResult({ message: "Processo não encontrado na conta conectada ao LegalMail." });
        else if (total === 0) setResult({ message: "O LegalMail não retornou andamentos em texto para este processo." });
        else setResult({ message: `${imported} novo(s) de ${total} andamento(s) consultado(s).`, showTimeline: true });
      })}>Buscar andamentos no LegalMail</Button>
      {result ? (
        <p role="status" className="max-w-sm text-xs text-muted">
          {result.message} {result.showTimeline ? <Link href={`/processos/${caseId}?aba=andamentos&fonte=IMPORTED`} className="underline">Ver na linha do tempo</Link> : null}
        </p>
      ) : null}
    </div>
  );
}
