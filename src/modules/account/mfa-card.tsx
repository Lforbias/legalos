"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { confirmMfaAction, disableMfaAction, regenerateRecoveryAction, startMfaAction } from "./actions";

type Setup = { secret: string; qrDataUrl: string };

export function MfaCard({ available, enabled, recoveryLeft, afterCodesHref }: { available: boolean; enabled: boolean; recoveryLeft: number; afterCodesHref?: string }) {
  const router = useRouter();
  const [setup, setSetup] = React.useState<Setup | null>(null);
  const [codes, setCodes] = React.useState<string[] | null>(null);
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  if (!available) {
    return <Alert tone="warning">A verificação em duas etapas ainda não foi habilitada neste sistema: falta a chave de cifra (variável MFA_ENCRYPTION_KEY). Veja o README.</Alert>;
  }

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      await fn();
    });

  return (
    <div className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {codes ? (
        <div className="space-y-2" data-testid="recovery-codes">
          <Alert tone="warning">Guarde estes códigos de recuperação em local seguro. Cada um funciona uma única vez e esta é a única vez que eles aparecem.</Alert>
          <ul className="grid grid-cols-2 gap-1 rounded-md border border-border p-3 font-mono text-sm">
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <Button
            variant="secondary"
            onClick={() => {
              setCodes(null);
              if (afterCodesHref) router.push(afterCodesHref);
              else router.refresh();
            }}
          >
            Já guardei os códigos
          </Button>
        </div>
      ) : setup ? (
        <div className="space-y-3">
          <p className="text-sm">Escaneie o QR code no aplicativo autenticador (Google Authenticator, Authy, 1Password…) ou digite a chave manualmente.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qrDataUrl} alt="QR code para o aplicativo autenticador" width={200} height={200} className="rounded-md border border-border bg-white" />
          <p className="break-all font-mono text-xs" data-testid="mfa-secret">{setup.secret}</p>
          <Field label="Código de 6 dígitos" htmlFor="mfa-confirm">
            <Input id="mfa-confirm" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Button
              loading={pending}
              onClick={() =>
                run(async () => {
                  const r = await confirmMfaAction(code);
                  if (!r.ok || !r.data) return setError(r.message ?? "Não foi possível ativar.");
                  setSetup(null);
                  setCode("");
                  setCodes(r.data.codes);
                })
              }
            >
              Ativar
            </Button>
            <Button variant="secondary" onClick={() => setSetup(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : enabled ? (
        <div className="space-y-3">
          <p className="text-sm">Verificação em duas etapas <strong>ativa</strong>. Códigos de recuperação restantes: {recoveryLeft}.</p>
          <Field label="Confirme sua senha para gerar novos códigos ou desativar" htmlFor="mfa-pass">
            <Input id="mfa-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={pending}
              onClick={() =>
                run(async () => {
                  const r = await regenerateRecoveryAction(password);
                  if (!r.ok || !r.data) return setError(r.message ?? "Não foi possível gerar os códigos.");
                  setPassword("");
                  setCodes(r.data.codes);
                })
              }
            >
              Gerar novos códigos de recuperação
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                run(async () => {
                  const r = await disableMfaAction(password);
                  if (!r.ok) return setError(r.message ?? "Não foi possível desativar.");
                  setPassword("");
                  router.refresh();
                })
              }
            >
              Desativar
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">Adicione uma segunda camada de proteção: além da senha, o login pede um código do seu celular.</p>
          <Button
            loading={pending}
            onClick={() =>
              run(async () => {
                const r = await startMfaAction();
                if (!r.ok || !r.data) return setError(r.message ?? "Não foi possível iniciar.");
                setSetup(r.data);
              })
            }
          >
            Ativar verificação em duas etapas
          </Button>
        </div>
      )}
    </div>
  );
}
