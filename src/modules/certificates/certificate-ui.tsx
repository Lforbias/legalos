"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { testCertificateTlsAction, restrictCertificateAction, authorizeCertificateUserAction, revokeCertificateAction, unauthorizeCertificateUserAction } from "./actions";

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
      <Alert tone="info">Novos certificados entram em <strong>somente consulta</strong>. Protocolos, assinaturas e usos fora das consultas permitidas ficam bloqueados no servidor, inclusive em agendamentos. Cadastrar o certificado apenas o guarda no cofre; não envia nada ao tribunal.</Alert>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {ok ? <Alert tone="success">Certificado guardado em modo somente consulta.</Alert> : null}
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

export function AuthorizedUsers({ certificateId, authorized, candidates }: { certificateId: string; authorized: { userId: string; name: string }[]; candidates: { id: string; name: string }[] }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const [pick, setPick] = React.useState("");
  const taken = new Set(authorized.map((a) => a.userId));
  const options = candidates.filter((m) => !taken.has(m.id));
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.message ?? "Não foi possível concluir.");
      else {
        setError(null);
        setPick("");
        router.refresh();
      }
    });
  return (
    <div className="mt-2 space-y-1.5 text-xs">
      <p className="text-muted">Também podem usar este certificado: {authorized.length ? "" : "ninguém além do titular."}</p>
      {authorized.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {authorized.map((a) => (
            <li key={a.userId} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
              {a.name}
              <button type="button" aria-label={`Remover ${a.name}`} disabled={pending} className="text-danger hover:underline" onClick={() => run(() => unauthorizeCertificateUserAction(certificateId, a.userId))}>
                remover
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {options.length ? (
        <div className="flex items-center gap-2">
          <Select aria-label="Autorizar usuário" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Autorizar usuário…</option>
            {options.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="secondary" loading={pending} disabled={!pick} onClick={() => run(() => authorizeCertificateUserAction(certificateId, pick))}>
            Autorizar
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-danger">{error}</p> : null}
    </div>
  );
}

export function RestrictCertificateButton({ id }: { id: string }) {
  const router = useRouter(); const [pending, start] = React.useTransition(); const [error, setError] = React.useState<string>();
  return <div><Button variant="secondary" loading={pending} onClick={() => { setError(undefined); start(async () => { const res = await restrictCertificateAction(id); if (!res.ok) setError(res.message); else router.refresh(); }); }}>Restringir a somente consulta</Button>{error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}</div>;
}

export function TestCertificateTlsButton({ id }: { id: string }) {
  const [pending, start] = React.useTransition(); const [result, setResult] = React.useState<{ ok: boolean; text: string }>();
  return <div><Button variant="secondary" loading={pending} onClick={() => { setResult(undefined); start(async () => { const res = await testCertificateTlsAction(id); setResult({ ok: res.ok, text: res.data?.message ?? res.message ?? "Não foi possível testar o arquivo." }); }); }}>Testar arquivo para conexão</Button>{result ? <p role="status" className={`mt-2 max-w-md text-xs ${result.ok ? "text-muted" : "text-danger"}`}>{result.text}</p> : null}</div>;
}
