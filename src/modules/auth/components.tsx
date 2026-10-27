"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { fieldError, useServerForm } from "@/components/forms/use-server-form";
import {
  acceptInviteAction,
  forgotPasswordAction,
  loginAction,
  verifyMfaAction,
  type LoginResult,
  registerAction,
  resendVerificationAction,
  resetPasswordAction,
  verifyEmailAction,
} from "./actions";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
} from "./schemas";

function useGo() {
  const router = useRouter();
  return (to: string) => {
    router.replace(to);
    router.refresh();
  };
}

export function LoginForm({ next, inviteToken }: { next?: string; inviteToken?: string }) {
  const go = useGo();
  const [challenge, setChallenge] = React.useState<string | null>(null);
  const { form, submit, pending, message } = useServerForm<LoginInput, LoginResult>({
    schema: loginSchema,
    defaultValues: { email: "", password: "", next, inviteToken },
    action: loginAction,
    onSuccess: (data) => (data?.mfaChallenge ? setChallenge(data.mfaChallenge) : go(data?.redirectTo ?? "/dashboard")),
  });
  if (challenge) return <MfaStep challenge={challenge} onDone={go} onCancel={() => setChallenge(null)} />;
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <h1 className="text-lg font-semibold">Entrar</h1>
      {message ? <Alert tone="error">{message}</Alert> : null}
      <Field label="E-mail" htmlFor="email" error={fieldError(form, "email")}>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!form.formState.errors.email} {...form.register("email")} />
      </Field>
      <Field label="Senha" htmlFor="password" error={fieldError(form, "password")}>
        <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!form.formState.errors.password} {...form.register("password")} />
      </Field>
      <Button type="submit" className="w-full" loading={pending}>
        Entrar
      </Button>
      <div className="flex justify-between text-xs">
        <Link href="/forgot-password" className="text-primary-text hover:underline">
          Esqueci a senha
        </Link>
        <Link href={inviteToken ? `/register?invite=${encodeURIComponent(inviteToken)}` : "/register"} className="text-primary-text hover:underline">
          Criar conta
        </Link>
      </div>
    </form>
  );
}

function MfaStep({ challenge, onDone, onCancel }: { challenge: string; onDone: (to: string) => void; onCancel: () => void }) {
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await verifyMfaAction({ challenge, code });
          if (r.ok) onDone(r.data?.redirectTo ?? "/dashboard");
          else {
            setError(r.message ?? "Não foi possível verificar o código.");
            setCode("");
          }
        });
      }}
    >
      <h1 className="text-lg font-semibold">Verificação em duas etapas</h1>
      <p className="text-sm text-muted">Digite o código de 6 dígitos do seu aplicativo autenticador ou um código de recuperação.</p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Field label="Código" htmlFor="mfa-code">
        <Input id="mfa-code" inputMode="text" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full" loading={pending}>
        Verificar
      </Button>
      <button type="button" className="text-xs text-primary-text hover:underline" onClick={onCancel}>
        Voltar
      </button>
    </form>
  );
}

export function RegisterForm({ inviteToken, inviteEmail, needsCode = false }: { inviteToken?: string; inviteEmail?: string; needsCode?: boolean }) {
  const go = useGo();
  const { form, submit, pending, message } = useServerForm<RegisterInput, { redirectTo: string }>({
    schema: registerSchema,
    defaultValues: { name: "", email: inviteEmail ?? "", password: "", inviteToken, accessCode: "" },
    action: registerAction,
    onSuccess: (data) => go(data?.redirectTo ?? "/onboarding"),
  });
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <h1 className="text-lg font-semibold">Criar conta</h1>
      {message ? <Alert tone="error">{message}</Alert> : null}
      <Field label="Nome completo" htmlFor="name" error={fieldError(form, "name")}>
        <Input id="name" autoComplete="name" aria-invalid={!!form.formState.errors.name} {...form.register("name")} />
      </Field>
      <Field label="E-mail" htmlFor="email" error={fieldError(form, "email")}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          readOnly={!!inviteEmail}
          aria-invalid={!!form.formState.errors.email}
          {...form.register("email")}
        />
      </Field>
      <Field label="Senha" htmlFor="password" error={fieldError(form, "password")} hint="Mínimo de 10 caracteres, com letras e números.">
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!form.formState.errors.password} {...form.register("password")} />
      </Field>
      {needsCode ? (
        <Field label="Código de acesso" htmlFor="accessCode" error={fieldError(form, "accessCode")} hint="Fornecido pela administração do LegalOS.">
          <Input id="accessCode" autoComplete="off" aria-invalid={!!form.formState.errors.accessCode} {...form.register("accessCode")} />
        </Field>
      ) : null}
      <Button type="submit" className="w-full" loading={pending}>
        Criar conta
      </Button>
      <p className="text-center text-xs text-muted">
        Já tem conta?{" "}
        <Link href={inviteToken ? `/login?invite=${encodeURIComponent(inviteToken)}` : "/login"} className="text-primary-text hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = React.useState(false);
  const { form, submit, pending, message } = useServerForm<ForgotPasswordInput, undefined>({
    schema: forgotPasswordSchema,
    defaultValues: { email: "" },
    action: forgotPasswordAction,
    onSuccess: () => setSent(true),
  });
  if (sent) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Verifique seu e-mail</h1>
        <Alert tone="info">
          Se existir uma conta com este e-mail, enviaremos um link de redefinição válido por 1 hora.
          <br />
          <span className="text-xs opacity-80">
            Observação: o envio de e-mail ainda não está configurado nesta instalação; em ambiente de desenvolvimento o link é registrado no log do servidor.
          </span>
        </Alert>
        <Link href="/login" className="text-xs text-primary-text hover:underline">
          Voltar ao login
        </Link>
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <h1 className="text-lg font-semibold">Recuperar senha</h1>
      {message ? <Alert tone="error">{message}</Alert> : null}
      <Field label="E-mail" htmlFor="email" error={fieldError(form, "email")}>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!form.formState.errors.email} {...form.register("email")} />
      </Field>
      <Button type="submit" className="w-full" loading={pending}>
        Enviar link
      </Button>
      <Link href="/login" className="block text-center text-xs text-primary-text hover:underline">
        Voltar ao login
      </Link>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [done, setDone] = React.useState(false);
  const { form, submit, pending, message } = useServerForm<ResetPasswordInput, undefined>({
    schema: resetPasswordSchema,
    defaultValues: { token, password: "" },
    action: resetPasswordAction,
    onSuccess: () => setDone(true),
  });
  if (done) {
    return (
      <div className="space-y-4">
        <Alert tone="success">Senha redefinida. Todas as sessões anteriores foram encerradas.</Alert>
        <Link href="/login" className="text-sm text-primary-text hover:underline">
          Ir para o login
        </Link>
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <h1 className="text-lg font-semibold">Nova senha</h1>
      {message ? <Alert tone="error">{message}</Alert> : null}
      <Field label="Nova senha" htmlFor="password" error={fieldError(form, "password")} hint="Mínimo de 10 caracteres, com letras e números.">
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!form.formState.errors.password} {...form.register("password")} />
      </Field>
      <Button type="submit" className="w-full" loading={pending}>
        Redefinir senha
      </Button>
    </form>
  );
}

export function VerifyEmailPanel({ token }: { token: string }) {
  const [state, setState] = React.useState<"idle" | "ok" | "error">("idle");
  const [msg, setMsg] = React.useState("");
  const [pending, start] = React.useTransition();
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Confirmar e-mail</h1>
      {state === "ok" ? <Alert tone="success">E-mail confirmado com sucesso.</Alert> : null}
      {state === "error" ? <Alert tone="error">{msg}</Alert> : null}
      {state !== "ok" ? (
        <Button
          className="w-full"
          loading={pending}
          onClick={() =>
            start(async () => {
              const res = await verifyEmailAction({ token });
              if (res.ok) setState("ok");
              else {
                setState("error");
                setMsg(res.message ?? "Link inválido.");
              }
            })
          }
        >
          Confirmar meu e-mail
        </Button>
      ) : null}
      <Link href="/dashboard" className="block text-center text-xs text-primary-text hover:underline">
        Ir para o sistema
      </Link>
    </div>
  );
}

export function ResendVerificationButton() {
  const [done, setDone] = React.useState(false);
  const [pending, start] = React.useTransition();
  if (done) return <span className="text-xs">Solicitação registrada.</span>;
  return (
    <button
      type="button"
      disabled={pending}
      className="cursor-pointer text-xs underline underline-offset-2"
      onClick={() =>
        start(async () => {
          const res = await resendVerificationAction();
          if (res.ok) setDone(true);
        })
      }
    >
      Reenviar confirmação
    </button>
  );
}

export function AcceptInvitePanel({ token, organizationName, roleName }: { token: string; organizationName: string; roleName: string }) {
  const go = useGo();
  const [msg, setMsg] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Aceitar convite</h1>
      <p className="text-sm text-muted">
        Você foi convidado(a) para <strong className="text-fg">{organizationName}</strong> como <strong className="text-fg">{roleName}</strong>.
      </p>
      {msg ? <Alert tone="error">{msg}</Alert> : null}
      <Button
        className="w-full"
        loading={pending}
        onClick={() =>
          start(async () => {
            const res = await acceptInviteAction({ token });
            if (res.ok) go(res.data?.redirectTo ?? "/dashboard");
            else setMsg(res.message ?? "Não foi possível aceitar o convite.");
          })
        }
      >
        Entrar no escritório
      </Button>
    </div>
  );
}
