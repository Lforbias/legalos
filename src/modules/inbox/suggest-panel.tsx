"use client";

import Link from "next/link";
import * as React from "react";
import { Sparkles } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { suggestNoticeAction } from "./flow-actions";

type S = { resumo: string; providencia: "PRAZO" | "TAREFA" | "NENHUMA" | "REVISAR"; titulo: string; prazoDias: number | null; contagem: "UTEIS" | "CORRIDOS" | null; motivo: string; tokens: number };
const LABEL = { PRAZO: "Cadastrar prazo", TAREFA: "Criar tarefa", NENHUMA: "Sem providência (ciência)", REVISAR: "Revisar com atenção" } as const;

/** Sugestão de providência por IA. Não cria nada: só preenche o formulário que a pessoa confere e salva. */
export function SuggestPanel({ noticeId, query, canTask, canDeadline, hasCase, disabledReason }: { noticeId: string; query: string; canTask: boolean; canDeadline: boolean; hasCase: boolean; disabledReason: string | null }) {
  const [s, setS] = React.useState<S | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  if (disabledReason) return <p className="text-xs text-muted" data-testid="suggest-off">Sugestão por IA indisponível: {disabledReason}</p>;
  const params = (extra: Record<string, string>) => {
    const p = new URLSearchParams(query);
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    return p.toString();
  };
  return (
    <div className="space-y-2" data-testid="suggest-panel">
      <Button
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            setS(null);
            const r = await suggestNoticeAction(noticeId);
            if (!r.ok || !r.data) setError(r.message ?? "Não foi possível obter a sugestão.");
            else setS(r.data);
          })
        }
      >
        <Sparkles className="h-4 w-4" aria-hidden /> Sugerir providência com IA
      </Button>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {s ? (
        <div className="space-y-2 rounded-md border border-border p-3 text-sm" data-testid="suggest-result">
          <div className="flex items-center justify-between gap-2">
            <Badge tone={s.providencia === "PRAZO" ? "warning" : s.providencia === "TAREFA" ? "info" : "neutral"}>{LABEL[s.providencia]}</Badge>
            <span className="text-xs text-muted">{s.tokens} tokens</span>
          </div>
          <p>{s.resumo}</p>
          {s.titulo ? <p><span className="text-xs text-muted">Título sugerido</span><br />{s.titulo}</p> : null}
          {s.prazoDias ? <p><span className="text-xs text-muted">Prazo mencionado no texto</span><br />{s.prazoDias} dia(s){s.contagem ? ` (${s.contagem === "UTEIS" ? "úteis" : "corridos"})` : ""}</p> : null}
          {s.motivo ? <p className="text-xs text-muted">{s.motivo}</p> : null}
          <p className="text-xs text-warning">Sugestão automática: nada foi criado. Confira o texto da publicação; só vale depois que você revisar e salvar.</p>
          <div className="flex flex-wrap gap-2">
            {s.providencia === "PRAZO" && canDeadline && hasCase ? <Link className={buttonVariants({ variant: "secondary", size: "sm" })} href={`/prazos/novo?${params({ titulo: s.titulo, dias: s.prazoDias ? String(s.prazoDias) : "", contagem: s.contagem === "UTEIS" ? "BUSINESS" : s.contagem === "CORRIDOS" ? "CALENDAR" : "" })}`}>Abrir prazo com estes dados</Link> : null}
            {s.providencia === "PRAZO" && canDeadline && !hasCase ? <span className="text-xs text-muted">Vincule a um processo para cadastrar o prazo.</span> : null}
            {(s.providencia === "TAREFA" || s.providencia === "PRAZO") && canTask ? <Link className={buttonVariants({ variant: "secondary", size: "sm" })} href={`/tarefas/nova?${params({ titulo: s.titulo })}`}>Abrir tarefa com este título</Link> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
