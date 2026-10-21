"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Field, Input } from "@/components/ui/form";
import { inviteToPortalAction, revokePortalAccessAction, revokePortalInvitationAction } from "./actions";

export type PortalAccountRow = { id: string; name: string; email: string };
export type PortalInviteRow = { id: string; email: string };

export function PortalPanel({ clientId, accounts, invitations, canManage }: { clientId: string; accounts: PortalAccountRow[]; invitations: PortalInviteRow[]; canManage: boolean }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState<{ link: string; emailDelivered: boolean } | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <Card>
      <CardHeader title="Portal do cliente" description="Pessoas que podem ver, no portal, apenas os processos e documentos que você compartilhar." />
      <CardBody className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {sent ? (
          <Alert tone="success">
            <p>{sent.emailDelivered ? "Convite enviado por e-mail." : "O envio de e-mail não está configurado nesta instalação. Copie o link abaixo e envie ao cliente por um canal seguro."}</p>
            {sent.emailDelivered ? null : <code data-testid="portal-invite-link" className="mt-1 block break-all rounded bg-surface-2 px-2 py-1 text-xs text-fg">{sent.link}</code>}
            <p className="mt-1 text-xs opacity-80">O link é exibido apenas agora. Para gerar outro, cancele o convite e convide novamente.</p>
          </Alert>
        ) : null}
        <ul className="divide-y divide-border">
          {accounts.length === 0 && invitations.length === 0 ? <li className="py-2 text-sm text-muted">Ninguém com acesso ao portal.</li> : null}
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>{a.name} <span className="text-xs text-muted">{a.email}</span></span>
              {canManage ? <ConfirmAction label="Revogar" confirmLabel="Revogar acesso" description="A pessoa deixa de ver qualquer conteúdo no portal." action={() => revokePortalAccessAction(a.id, clientId)} onDone={() => router.refresh()} /> : null}
            </li>
          ))}
          {invitations.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span>{i.email} <span className="text-xs text-warning">convite pendente</span></span>
              {canManage ? <ConfirmAction label="Cancelar convite" confirmLabel="Cancelar convite" action={() => revokePortalInvitationAction(i.id, clientId)} onDone={() => router.refresh()} /> : null}
            </li>
          ))}
        </ul>
        {canManage ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-64 flex-1">
              <Field label="Convidar por e-mail" htmlFor="portal-email">
                <Input id="portal-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@exemplo.com" />
              </Field>
            </div>
            <Button
              size="sm"
              loading={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  setSent(null);
                  const res = await inviteToPortalAction(clientId, email);
                  if (!res.ok) {
                    setError(res.fieldErrors?.email?.[0] ?? res.message ?? "Não foi possível enviar o convite.");
                    return;
                  }
                  setEmail("");
                  setSent(res.data ?? null);
                  router.refresh();
                })
              }
            >
              Enviar convite
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
