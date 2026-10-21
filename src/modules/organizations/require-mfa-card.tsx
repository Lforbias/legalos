"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setRequireMfaAction } from "./actions";

export function RequireMfaCard({ required, total, withMfa, canEdit }: { required: boolean; total: number; withMfa: number; canEdit: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = React.useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = React.useTransition();
  const toggle = (next: boolean) => start(async () => {
    const r = await setRequireMfaAction(next);
    setMsg(r.ok ? { tone: "success", text: next ? "Verificação em duas etapas agora é obrigatória." : "A exigência foi desligada." } : { tone: "error", text: r.message ?? "Não foi possível alterar." });
    router.refresh();
  });
  const without = total - withMfa;
  return (
    <div className="space-y-3 text-sm" data-testid="require-mfa-card">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">Exigir 2FA de todos:</span>
        <Badge tone={required ? "success" : "neutral"} data-testid="require-mfa-status">{required ? "Ligado" : "Desligado"}</Badge>
        {canEdit ? (required ? <Button size="sm" variant="secondary" loading={pending} onClick={() => toggle(false)}>Desligar</Button> : <Button size="sm" loading={pending} onClick={() => toggle(true)}>Ligar</Button>) : null}
      </div>
      <p className="text-xs text-muted">{withMfa} de {total} membro(s) já ativaram. {required ? (without > 0 ? `${without} ainda vão ver uma tela pedindo a ativação antes de entrar.` : "Todos já estão protegidos.") : "Ao ligar, quem ainda não ativou só consegue entrar depois de ativar. Você precisa ter o seu 2FA ativo antes."}</p>
    </div>
  );
}
