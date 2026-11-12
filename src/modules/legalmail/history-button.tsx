"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { syncLegalMailHistoryAction } from "./actions";

type Candidate = { id: number; className: string | null; total: number | null; latest: string | null };

export function LegalMailHistoryButton({ caseId }: { caseId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ message: string; showTimeline?: boolean } | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  function search(selected?: number) {
    start(async () => {
      setResult(null);
      if (selected === undefined) setCandidates([]);
      const response = await syncLegalMailHistoryAction(caseId, selected);
      if (!response.ok || !response.data) {
        setResult({ message: response.message ?? "Não foi possível consultar o LegalMail." });
        return;
      }
      const { found, total, imported, candidates: options } = response.data;
      setCandidates(options ?? []);
      if (options?.length) setResult({ message: "Mais de um cadastro tem este CNJ. Escolha o cadastro para importar." });
      else if (!found) setResult({ message: "Processo não encontrado na conta conectada ao LegalMail." });
      else if (total === 0) setResult({ message: "O LegalMail não retornou andamentos em texto para este cadastro." });
      else setResult({ message: `${imported} novo(s) de ${total} andamento(s) consultado(s).`, showTimeline: true });
    });
  }

  return (
    <div className="space-y-2">
      <Button variant="secondary" loading={pending} onClick={() => search()}>Buscar andamentos no LegalMail</Button>
      {result ? (
        <p role="status" className="max-w-sm text-xs text-muted">
          {result.message} {result.showTimeline ? <Link href={`/processos/${caseId}?aba=andamentos&fonte=IMPORTED`} className="underline">Ver na linha do tempo</Link> : null}
        </p>
      ) : null}
      {candidates.length ? (
        <ul className="max-w-sm space-y-2 rounded-md border border-border bg-surface p-2 text-xs" aria-label="Cadastros no LegalMail">
          {candidates.map((candidate) => (
            <li key={candidate.id} className="space-y-1">
              <p>{candidate.className ?? "Classe não informada"} · {candidate.total === null ? "Histórico indisponível para conferência" : `${candidate.total} andamento(s)`}{candidate.latest ? ` · Último em ${candidate.latest.split("-").reverse().join("/")}` : ""}</p>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => search(candidate.id)}>Importar cadastro {candidate.id}</Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
