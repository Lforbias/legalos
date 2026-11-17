"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, X } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { updateWelcomeActivationAction } from "./actions";

const BASE_ITEMS = [
  { id: "client", title: "Cadastre seu primeiro cliente", href: "/clientes/novo", detail: "Comece organizando os contatos do escritório." },
  { id: "case", title: "Crie seu primeiro processo ou caso", href: "/processos/novo", detail: "Vincule um cliente e centralize prazos e atividades." },
  { id: "documents", title: "Organize os documentos", href: "/documentos", detail: "Acesse a área de documentos do escritório." },
  { id: "messaging", title: "Configure o atendimento", href: "/atendimento", detail: "Confira a conexão de mensagens e configure quando estiver pronto." },
] as const;
const TEAM_ITEM = { id: "team", title: "Convide alguém da equipe", href: "/configuracoes/equipe", detail: "Convites usam o fluxo existente e não contratam um novo plano." } as const;

export function ActivationChecklist({ completed: initialCompleted, dismissed: initiallyDismissed, showTeam }: { completed: string[]; dismissed: boolean; showTeam: boolean }) {
  const router = useRouter();
  const [dismissed, setDismissed] = React.useState(initiallyDismissed);
  const [pending, startTransition] = React.useTransition();
  const completed = initialCompleted;
  const items = showTeam ? [BASE_ITEMS[0], BASE_ITEMS[1], TEAM_ITEM, BASE_ITEMS[2], BASE_ITEMS[3]] : [...BASE_ITEMS];
  if (dismissed) return null;
  const count = items.filter((item) => completed.includes(item.id)).length;

  function dismiss() {
    startTransition(async () => {
      const result = await updateWelcomeActivationAction({ dismissed: true });
      if (!result.ok) return;
      setDismissed(true);
      router.refresh();
    });
  }

  return (
    <Card data-testid="welcome-activation-checklist">
      <CardHeader title="Seu começo no LegalOS" description={`${count} de ${items.length} passos concluídos. Faça no seu ritmo; o restante da plataforma já está disponível.`} action={<button type="button" aria-label="Ocultar checklist" disabled={pending} onClick={dismiss} className="rounded p-1 text-muted hover:bg-surface-2"><X aria-hidden className="h-4 w-4" /></button>} />
      <CardBody className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => {
          const done = completed.includes(item.id);
          return (
            <div key={item.id} className="flex items-start gap-2 rounded-lg border border-border p-3">
              <span aria-label={done ? "Concluído" : "Pendente"} className={`mt-0.5 shrink-0 ${done ? "text-success" : "text-muted"}`}>
                {done ? <CheckCircle2 aria-hidden className="h-4 w-4" /> : <Circle aria-hidden className="h-4 w-4" />}
              </span>
              <div className="min-w-0">
                <Link href={item.href} className={`text-sm font-medium hover:text-primary-text hover:underline ${done ? "text-muted line-through" : ""}`}>{item.title}</Link>
                <p className="mt-0.5 text-xs text-muted">{item.detail}</p>
              </div>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
