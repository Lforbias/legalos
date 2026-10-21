"use client";

import { Check, Copy, MoreHorizontal, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { Menu, MenuItem } from "@/components/ui/menu";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { formatDate } from "@/lib/dates/format";
import { changeMemberRoleAction, inviteAction, removeMemberAction, revokeInvitationAction, setMemberStatusAction } from "./actions";
import { inviteSchema, type InviteInput } from "./schemas";

type Member = {
  id: string;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
  user: { id: string; name: string; email: string };
  role: { id: string; key: string; name: string };
};
type RoleOpt = { id: string; name: string; key: string; assignable: boolean };
type Invite = { id: string; email: string; createdAt: string; expiresAt: string; expired: boolean; roleName: string };

export function TeamManager({
  members,
  roles,
  invitations,
  currentUserId,
  canInvite,
  canManage,
  timezone,
  openInvite,
}: {
  members: Member[];
  roles: RoleOpt[];
  invitations: Invite[];
  currentUserId: string;
  canInvite: boolean;
  canManage: boolean;
  timezone: string;
  openInvite: boolean;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = React.useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = React.useTransition();
  const [confirmRemove, setConfirmRemove] = React.useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, okText: string) =>
    start(async () => {
      const res = await fn();
      setFeedback(res.ok ? { tone: "success", text: okText } : { tone: "error", text: res.message ?? "Falha na operação." });
      if (res.ok) router.refresh();
    });

  return (
    <div className="space-y-4">
      {feedback ? <Alert tone={feedback.tone}>{feedback.text}</Alert> : null}

      {canInvite ? <InvitePanel roles={roles.filter((r) => r.assignable)} defaultOpen={openInvite} onDone={() => router.refresh()} /> : null}

      <Card>
        <CardHeader title={`Membros (${members.length})`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Pessoa</th>
                <th className="px-4 py-2 font-medium">Perfil</th>
                <th className="px-4 py-2 font-medium">Situação</th>
                <th className="px-4 py-2 font-medium">Desde</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((m) => {
                const isSelf = m.user.id === currentUserId;
                const roleOptions = roles.filter((r) => r.assignable || r.id === m.role.id);
                return (
                  <tr key={m.id}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">
                        {m.user.name} {isSelf ? <span className="text-xs font-normal text-muted">(você)</span> : null}
                      </div>
                      <div className="text-xs text-muted">{m.user.email}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      {canManage ? (
                        <Select
                          aria-label={`Perfil de ${m.user.name}`}
                          className="h-8 w-48"
                          value={m.role.id}
                          disabled={pending}
                          onChange={(e) => run(() => changeMemberRoleAction(m.id, e.target.value), "Perfil atualizado.")}
                        >
                          {roleOptions.map((r) => (
                            <option key={r.id} value={r.id} disabled={!r.assignable && r.id !== m.role.id}>
                              {r.name}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Badge tone="accent">{m.role.name}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5">{m.status === "ACTIVE" ? <Badge tone="success">Ativo</Badge> : <Badge tone="warning">Suspenso</Badge>}</td>
                    <td className="px-4 py-2.5 text-xs text-muted">{formatDate(m.createdAt, timezone)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {canManage && !isSelf ? (
                        confirmRemove === m.id ? (
                          <span className="inline-flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="danger"
                              loading={pending}
                              onClick={() => {
                                setConfirmRemove(null);
                                run(() => removeMemberAction(m.id), "Membro removido.");
                              }}
                            >
                              Confirmar remoção
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(null)}>
                              Cancelar
                            </Button>
                          </span>
                        ) : (
                          <Menu
                            label={`Ações para ${m.user.name}`}
                            trigger={
                              <span className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2">
                                <MoreHorizontal className="h-4 w-4" aria-hidden />
                              </span>
                            }
                          >
                            {(close) => (
                              <>
                                <MenuItem
                                  onClick={() => {
                                    close();
                                    run(() => setMemberStatusAction(m.id, m.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"), m.status === "ACTIVE" ? "Membro suspenso." : "Membro reativado.");
                                  }}
                                >
                                  {m.status === "ACTIVE" ? "Suspender acesso" : "Reativar acesso"}
                                </MenuItem>
                                <MenuItem
                                  className="text-danger"
                                  onClick={() => {
                                    close();
                                    setConfirmRemove(m.id);
                                  }}
                                >
                                  Remover do escritório
                                </MenuItem>
                              </>
                            )}
                          </Menu>
                        )
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {members.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    Nenhum membro encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {canInvite ? (
        <Card>
          <CardHeader title={`Convites pendentes (${invitations.length})`} />
          {invitations.length === 0 ? (
            <CardBody>
              <p className="text-sm text-muted">Nenhum convite pendente.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {invitations.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div>
                    <div>{i.email}</div>
                    <div className="text-xs text-muted">
                      {i.roleName} · enviado em {formatDate(i.createdAt, timezone)} · {i.expired ? "expirado" : `expira em ${formatDate(i.expiresAt, timezone)}`}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => revokeInvitationAction(i.id), "Convite revogado.")}>
                    Revogar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
}

function InvitePanel({ roles, defaultOpen, onDone }: { roles: RoleOpt[]; defaultOpen: boolean; onDone: () => void }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [result, setResult] = React.useState<{ link: string; emailDelivered: boolean } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const { form, submit, pending, message } = useServerForm<InviteInput, { link: string; emailDelivered: boolean }>({
    schema: inviteSchema,
    defaultValues: { email: "", roleId: roles.find((r) => r.key === "ASSISTANT")?.id ?? roles[0]?.id ?? "" },
    action: inviteAction,
    onSuccess: (data, f) => {
      if (data) setResult(data);
      f.reset({ email: "", roleId: f.getValues("roleId") });
      onDone();
    },
  });

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" aria-hidden /> Convidar usuário
      </Button>
    );
  }
  return (
    <Card>
      <CardHeader title="Convidar usuário" description="O convite vale por 7 dias e só pode ser aceito pelo e-mail informado." />
      <CardBody className="space-y-3">
        {message ? <Alert tone="error">{message}</Alert> : null}
        {result ? (
          <Alert tone={result.emailDelivered ? "success" : "warning"}>
            <p>{result.emailDelivered ? "Convite enviado por e-mail." : "O envio de e-mail não está configurado nesta instalação. Copie o link abaixo e envie ao convidado por um canal seguro."}</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-surface-2 px-2 py-1 text-xs text-fg">{result.link}</code>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(result.link);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />} {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <p className="mt-1 text-xs opacity-80">Este link é exibido apenas agora e não pode ser recuperado depois (revogue e crie outro, se necessário).</p>
          </Alert>
        ) : null}
        <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
          <Field label="E-mail" htmlFor="invite-email" error={fieldError(form, "email")}>
            <Input id="invite-email" type="email" autoComplete="off" aria-invalid={!!form.formState.errors.email} {...form.register("email")} />
          </Field>
          <Field label="Perfil" htmlFor="invite-role" error={fieldError(form, "roleId")}>
            <Select id="invite-role" {...form.register("roleId")}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" loading={pending} onClick={() => setCopied(false)}>
            Gerar convite
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
