"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { autosJobAction, enqueueAutosAction, retryAutosAction } from "./autos-actions";
type Job = { id: string; status: string; listed: number; imported: number; remaining: number; skipped: number; attempts: number; error: string | null; updatedAt: string; nextRunAt: string };
const labels: Record<string, string> = { QUEUED: "Na fila", RUNNING: "Baixando", RETRY: "Aguardando nova tentativa", FAILED: "Falha no download", COMPLETED: "Concluído" };
export function AutosQueue({ caseId, canWrite }: { caseId: string; canWrite: boolean }) {
  const router = useRouter();
  const [job, setJob] = React.useState<Job | null>(null);
  const [error, setError] = React.useState("");
  const [pending, start] = React.useTransition();
  const statusRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const result = await autosJobAction(caseId);
      if (stopped) return;
      if (result.ok) {
        const next = result.data ?? null;
        setJob(next);
        if (statusRef.current && next?.status === "COMPLETED" && statusRef.current !== "COMPLETED") router.refresh();
        statusRef.current = next?.status;
      } else setError(result.message ?? "Não foi possível atualizar o download.");
      timer = setTimeout(poll, 5000);
    }
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [caseId, router]);
  const active = job && ["QUEUED", "RUNNING", "RETRY"].includes(job.status);
  return <section aria-label="Fila de download dos autos" className="mb-4 rounded border border-border p-3 text-sm space-y-2">
    <div role="status" aria-live="polite">{job ? <><strong>{labels[job.status] ?? job.status}</strong> · {job.listed} arquivos listados · {job.imported} novos importados · {job.remaining} pendentes · {job.skipped} ignorados{job.status === "RETRY" ? ` · tentativa ${job.attempts} de 3` : ""}</> : "Nenhum download em fila."}</div>
    {job && job.listed > 0 ? <progress aria-label="Progresso do download" className="w-full" max={job.listed} value={Math.max(0, job.listed - job.remaining)} /> : null}
    {job?.skipped ? <p>Arquivos sigilosos, formatos não aceitos ou maiores que o limite não são importados.</p> : null}
    {job?.error ? <p>{job.error}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {canWrite ? <Button variant="secondary" loading={pending} disabled={Boolean(active)} onClick={() => start(async () => {
      setError("");
      const r = job?.status === "FAILED" ? await retryAutosAction(caseId, job.id) : await enqueueAutosAction(caseId);
      if (!r.ok) setError(r.message ?? "Não foi possível iniciar o download.");
      else { const next = await autosJobAction(caseId); if (next.ok) setJob(next.data ?? null); }
    })}>{job?.status === "FAILED" ? "Tentar download novamente" : "Baixar todos os autos"}</Button> : null}
    <p className="text-muted">A fila continua em segundo plano, mesmo ao sair desta página. Os documentos já recebidos são preservados.</p>
  </section>;
}
