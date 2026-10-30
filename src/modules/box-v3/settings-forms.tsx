"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { revokeBoxV3CertificateAction, uploadBoxV3CertificateAction } from "@/modules/certificates/actions";

export function BoxV3UploadCertificateForm({ members }: { members: { id: string; name: string }[] }) {
  const router = useRouter();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [label, setLabel] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [owner, setOwner] = React.useState(members[0]?.id ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);
  const [pending, start] = React.useTransition();

  function save() {
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Selecione o arquivo do certificado.");
    setError(null);
    setOk(false);
    start(async () => {
      const data = new FormData();
      data.set("file", file);
      data.set("password", password);
      data.set("label", label);
      data.set("ownerUserId", owner);
      const result = await uploadBoxV3CertificateAction(data);
      if (!result.ok) return setError(result.message ?? "Não foi possível guardar o certificado.");
      setPassword("");
      setLabel("");
      if (fileRef.current) fileRef.current.value = "";
      setOk(true);
      router.refresh();
    });
  }

  return <div className="space-y-3">
    {error ? <Alert tone="error">{error}</Alert> : null}
    {ok ? <Alert tone="success">Certificado guardado em modo somente consulta.</Alert> : null}
    <Field label="Nome para identificar" htmlFor="box-v3-cert-label"><Input id="box-v3-cert-label" value={label} maxLength={120} onChange={(event) => setLabel(event.target.value)} /></Field>
    <Field label="Advogado titular" htmlFor="box-v3-cert-owner"><Select id="box-v3-cert-owner" value={owner} onChange={(event) => setOwner(event.target.value)}>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</Select></Field>
    <Field label="Arquivo A1 (.pfx / .p12)" htmlFor="box-v3-cert-file"><input ref={fileRef} id="box-v3-cert-file" type="file" accept=".pfx,.p12" className="block w-full text-sm" /></Field>
    <Field label="Senha do certificado" htmlFor="box-v3-cert-password" hint="A senha fica cifrada e nunca volta para a tela."><Input id="box-v3-cert-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
    <Button loading={pending} onClick={save}>Guardar certificado</Button>
  </div>;
}

export function RevokeBoxV3CertificateButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  return <div className="space-y-1">{error ? <p className="text-xs text-danger">{error}</p> : null}<Button size="sm" variant="danger" loading={pending} onClick={() => {
    if (!window.confirm("Revogar apaga o certificado cifrado do cofre e não pode ser desfeito. Continuar?")) return;
    start(async () => {
      const result = await revokeBoxV3CertificateAction(id);
      if (!result.ok) setError(result.message ?? "Não foi possível revogar o certificado.");
      else router.refresh();
    });
  }}>Revogar</Button></div>;
}
