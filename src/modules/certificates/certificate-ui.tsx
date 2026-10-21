"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { revokeCertificateAction } from "./actions";

export function UploadCertificateForm({ members }: { members: { id: string; name: string }[] }) {
  const router = useRouter();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [label, setLabel] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [owner, setOwner] = React.useState(members[0]?.id ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);
  const [pending, start] = React.useTransition();

  const send = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Selecione o arquivo do certificado.");
    setError(null);
    setOk(false);
    start(async () => {
      try {
        const body = new FormData();
        body.set("file", file);
        body.set("password", password);
        body.set("label", label);
        body.set("ownerUserId", owner);
        const res = await fetch("/api/certificates", { method: "POST", body });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string; fieldErrors?: Record<string, string[]> };
          return setError(Object.values(j.fieldErrors ?? {})[0]?.[0] ?? j.error ?? "Não foi possível guardar o certificado.");
        }
        setPassword("");
        setLabel("");
        if (fileRef.current) fileRef.current.value = "";
        setOk(true);
        router.refresh();
      } catch {
        setError("Falha de comunicação com o servidor.");
      }
    });
  };

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {ok ? <Alert tone="success">Certificado guardado com segurança.</Alert> : null}
      <Field label="Nome para identificar" htmlFor="cert-label" hint='Ex.: "Dra. Talita — A1 2026"'>
        <Input id="cert-label" value={label} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <Field label="Advogado titular" htmlFor="cert-owner">
        <Select id="cert-owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Arquivo do certificado A1 (.pfx / .p12)" htmlFor="cert-file">
        <input ref={fileRef} id="cert-file" type="file" accept=".pfx,.p12" className="block w-full text-sm" />
      </Field>
      <Field label="Senha do certificado" htmlFor="cert-pass" hint="Usada só para abrir o arquivo; fica cifrada e nunca é exibida.">
        <Input id="cert-pass" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Button loading={pending} onClick={send}>
        Guardar certificado
      </Button>
    </div>
  );
}

export function RevokeCertificateButton({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <Button
        variant="danger"
        size="sm"
        loading={pending}
        onClick={() => {
          if (!window.confirm("Revogar apaga o certificado cifrado do cofre. Esta ação não pode ser desfeita. Continuar?")) return;
          start(async () => {
            const r = await revokeCertificateAction(id);
            if (!r.ok) setError(r.message ?? "Não foi possível revogar.");
            else router.refresh();
          });
        }}
      >
        Revogar
      </Button>
    </div>
  );
}
