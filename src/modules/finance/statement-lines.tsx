"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoneyBR } from "@/lib/validation/money";
import { ignoreStatementLineAction, reconcileStatementLineAction } from "./reconciliation-actions";

type Candidate = { id: string; description: string; amount: string; paidAmount: string; dueDate: string; counterparty: string | null };
type Line = { id: string; postedOn: string; description: string; amount: string; direction: "RECEIVABLE" | "PAYABLE"; status: "PENDING" | "MATCHED" | "IGNORED"; candidates: Candidate[] };

function StatementLine({ importId, line, canWrite }: { importId: string; line: Line; canWrite: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState(line.candidates[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean; message?: string }>) => start(async () => {
    setError(null);
    const result = await fn();
    if (!result.ok) setError(result.message ?? "A ação não foi concluída.");
    else router.refresh();
  });
  const statusLabel = line.status === "MATCHED" ? "Conciliado" : line.status === "IGNORED" ? "Ignorado" : "Pendente";
  return (
    <li className="space-y-3 px-4 py-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{line.description} <Badge tone={line.status === "MATCHED" ? "success" : line.status === "IGNORED" ? "neutral" : "warning"}>{statusLabel}</Badge></p>
          <p className="mt-1 text-xs text-muted">{line.postedOn} · {line.direction === "RECEIVABLE" ? "Entrada" : "Saída"} · {formatMoneyBR(line.amount)}</p>
        </div>
        {line.status === "PENDING" && canWrite ? (
          <div className="flex flex-wrap gap-2">
            {line.candidates.length ? (
              <>
                <select className="h-9 max-w-72 rounded-md border border-border bg-surface px-2 text-sm" aria-label={`Lançamento correspondente a ${line.description}`} value={selected} onChange={(event) => setSelected(event.target.value)}>
                  {line.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.description} · {formatMoneyBR(candidate.amount)} · vence {candidate.dueDate}{candidate.counterparty ? ` · ${candidate.counterparty}` : ""}</option>)}
                </select>
                <Button size="sm" loading={pending} disabled={!selected} onClick={() => act(() => reconcileStatementLineAction(importId, line.id, selected))}>Conciliar</Button>
              </>
            ) : <span className="self-center text-xs text-muted">Sem sugestão compatível</span>}
            <Button variant="secondary" size="sm" loading={pending} onClick={() => act(() => ignoreStatementLineAction(importId, line.id))}>Ignorar</Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function StatementLines({ importId, lines, canWrite }: { importId: string; lines: Line[]; canWrite: boolean }) {
  return (
    <ul className="divide-y divide-border">
      {lines.map((line) => <StatementLine key={line.id} importId={importId} line={line} canWrite={canWrite} />)}
      {lines.length === 0 ? <li className="p-6 text-center text-sm text-muted">Esta importação não tem linhas para exibir.</li> : null}
    </ul>
  );
}
