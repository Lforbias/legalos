"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { deleteCredentialAction, saveCredentialAction, verifyCredentialAction } from "./actions";

type SystemOpt = { key: string; label: string; authModes: string[]; connector: boolean; notes: string };
const MODE_LABEL: Record<string, string> = { PASSWORD: "Usuário e senha", CERTIFICATE: "Certificado digital", PASSWORD_AND_CERTIFICATE: "Senha e certificado" };

export function CredentialForm({ systems, tribunals, certificates }: { systems: SystemOpt[]; tribunals: { jtr: string; label: string }[]; certificates: { id: string; label: string }[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);
  const [system, setSystem] = React.useState(systems[0]!.key);
  const sys = systems.find((s) => s.key === system)!;
  const [mode, setMode] = React.useState(sys.authModes[0]!);
  const [courtCode, setCourtCode] = React.useState("");
  const [document, setDocument] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [certificateId, setCertificateId] = React.useState("");
  const modes = sys.authModes;
  const effectiveMode = modes.includes(mode) ? mode : modes[0]!;
  const needsPassword = effectiveMode !== "CERTIFICATE";
  const needsCert = effectiveMode !== "PASSWORD";
  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {ok ? <Alert tone="success">Credencial guardada (cifrada).</Alert> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Sistema" htmlFor="cc-system">
          <Select id="cc-system" value={system} onChange={(e) => setSystem(e.target.value)}>
            {systems.map((s) => (
              <option key={s.key} value={s.key}>{s.label}{s.connector ? "" : " (sem conector ainda)"}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tribunal" htmlFor="cc-court" hint="Vazio = vale para todos os tribunais deste sistema.">
          <Select id="cc-court" value={courtCode} onChange={(e) => setCourtCode(e.target.value)}>
            <option value="">Todos</option>
            {tribunals.map((t) => (
              <option key={t.jtr} value={t.jtr}>{t.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Como você acessa" htmlFor="cc-mode">
          <Select id="cc-mode" value={effectiveMode} onChange={(e) => setMode(e.target.value)}>
            {modes.map((m) => (
              <option key={m} value={m}>{MODE_LABEL[m]}</option>
            ))}
          </Select>
        </Field>
        <Field label="CPF/CNPJ de acesso" htmlFor="cc-doc">
          <Input id="cc-doc" inputMode="numeric" autoComplete="off" value={document} onChange={(e) => setDocument(e.target.value)} />
        </Field>
        {needsPassword ? (
          <Field label="Senha do sistema" htmlFor="cc-pass">
            <Input id="cc-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        ) : null}
        {needsCert ? (
          <Field label="Certificado do cofre" htmlFor="cc-cert" hint={certificates.length ? undefined : "Você não tem certificado disponível. Peça a quem administra o cofre para autorizar você."}>
            <Select id="cc-cert" value={certificateId} onChange={(e) => setCertificateId(e.target.value)}>
              <option value="">Escolha…</option>
              {certificates.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>
      <p className="text-xs text-muted">{sys.notes}</p>
      {system === "pje-mni" ? <Alert tone="info">O segundo fator do PJe/Jus.br é separado do 2FA do LegalOS. O MNI não recebe automaticamente o OTP e não abre sessão no portal PJe. O autenticador pessoal do tribunal pode ser cadastrado em Integrações → PJe. Cadastrar certificado ou autenticador não confirma acesso ao tribunal.</Alert> : null}
      <Button
        loading={pending}
        onClick={() =>
          start(async () => {
            setOk(false);
            const r = await saveCredentialAction({ system, courtCode: courtCode || null, authMode: effectiveMode, document, password: needsPassword ? password : null, certificateId: needsCert ? certificateId || null : null });
            if (!r.ok) setError(Object.values(r.fieldErrors ?? {})[0]?.[0] ?? r.message ?? "Não foi possível guardar.");
            else {
              setError(null);
              setOk(true);
              setPassword("");
              router.refresh();
            }
          })
        }
      >
        Guardar credencial
      </Button>
    </div>
  );
}

export function CredentialActions({ id, mine }: { id: string; mine: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.message ?? "Não foi possível concluir.");
      else {
        setError(null);
        router.refresh();
      }
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {mine ? (
        <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => verifyCredentialAction(id))}>
          Conferir requisitos
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="danger"
        loading={pending}
        onClick={() => {
          if (!window.confirm("Remover esta credencial? O segredo cifrado é apagado.")) return;
          run(() => deleteCredentialAction(id));
        }}
      >
        Remover
      </Button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
