"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import { formatDateTime } from "@/lib/dates/format";
import { TIMEZONE_OPTIONS } from "@/lib/validation/timezone";
import { changePasswordAction, revokeOtherSessionsAction, revokeSessionAction, updateProfileAction } from "./actions";
import { changePasswordSchema, profileSchema, type ChangePasswordInput, type ProfileInput } from "./schemas";

export function ProfileForm({ initial }: { initial: ProfileInput }) {
  const router = useRouter();
  const [saved, setSaved] = React.useState(false);
  const { form, submit, pending, message } = useServerForm<ProfileInput, undefined>({
    schema: profileSchema,
    defaultValues: initial,
    action: (v) => {
      setSaved(false);
      return updateProfileAction(v);
    },
    onSuccess: () => {
      setSaved(true);
      router.refresh();
    },
  });
  const tzOptions = TIMEZONE_OPTIONS.includes(initial.timezone as never) ? TIMEZONE_OPTIONS : [initial.timezone, ...TIMEZONE_OPTIONS];
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {message ? <Alert tone="error">{message}</Alert> : null}
      {saved ? <Alert tone="success">Perfil atualizado.</Alert> : null}
      <Field label="Nome" htmlFor="profile-name" error={fieldError(form, "name")}>
        <Input id="profile-name" autoComplete="name" {...form.register("name")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Idioma" htmlFor="profile-locale" error={fieldError(form, "locale")} hint="A interface está disponível apenas em português nesta fase.">
          <Select id="profile-locale" {...form.register("locale")}>
            <option value="pt-BR">Português (Brasil)</option>
            <option value="en-US">English (preferência salva)</option>
          </Select>
        </Field>
        <Field label="Fuso horário" htmlFor="profile-tz" error={fieldError(form, "timezone")}>
          <Select id="profile-tz" {...form.register("timezone")}>
            {tzOptions.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button type="submit" loading={pending}>
        Salvar perfil
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [done, setDone] = React.useState(false);
  const { form, submit, pending, message } = useServerForm<ChangePasswordInput, undefined>({
    schema: changePasswordSchema,
    defaultValues: { currentPassword: "", newPassword: "" },
    action: (v) => {
      setDone(false);
      return changePasswordAction(v);
    },
    onSuccess: (_d, f) => {
      f.reset({ currentPassword: "", newPassword: "" });
      setDone(true);
    },
  });
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {message ? <Alert tone="error">{message}</Alert> : null}
      {done ? <Alert tone="success">Senha alterada. Suas outras sessões foram encerradas.</Alert> : null}
      <Field label="Senha atual" htmlFor="current-password" error={fieldError(form, "currentPassword")}>
        <Input id="current-password" type="password" autoComplete="current-password" {...form.register("currentPassword")} />
      </Field>
      <Field label="Nova senha" htmlFor="new-password" error={fieldError(form, "newPassword")} hint="Mínimo de 10 caracteres, com letras e números.">
        <Input id="new-password" type="password" autoComplete="new-password" {...form.register("newPassword")} />
      </Field>
      <Button type="submit" loading={pending}>
        Alterar senha
      </Button>
    </form>
  );
}

type SessionRow = { id: string; userAgent: string | null; ipAddress: string | null; createdAt: string; lastSeenAt: string; current: boolean };

export function SessionsList({ sessions, timezone }: { sessions: SessionRow[]; timezone: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<string | null>(null);
  const others = sessions.filter((s) => !s.current).length;
  return (
    <div className="space-y-3">
      {msg ? <Alert tone="info">{msg}</Alert> : null}
      <ul className="divide-y divide-border rounded-md border border-border">
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="truncate">
                {s.userAgent ? s.userAgent.slice(0, 70) : "Dispositivo desconhecido"} {s.current ? <span className="ml-1 rounded bg-success-bg px-1.5 text-[11px] text-success">esta sessão</span> : null}
              </p>
              <p className="text-xs text-muted">
                IP {s.ipAddress ?? "—"} · último uso {formatDateTime(s.lastSeenAt, timezone)}
              </p>
            </div>
            {s.current ? null : (
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await revokeSessionAction(s.id);
                    setMsg(res.ok ? "Sessão encerrada." : (res.message ?? "Falha ao encerrar."));
                    router.refresh();
                  })
                }
              >
                Encerrar
              </Button>
            )}
          </li>
        ))}
      </ul>
      {others > 0 ? (
        <Button
          variant="danger"
          loading={pending}
          onClick={() =>
            start(async () => {
              const res = await revokeOtherSessionsAction();
              setMsg(res.ok ? `${res.data?.count ?? 0} sessão(ões) encerrada(s).` : (res.message ?? "Falha."));
              router.refresh();
            })
          }
        >
          Encerrar todas as outras sessões
        </Button>
      ) : null}
    </div>
  );
}
