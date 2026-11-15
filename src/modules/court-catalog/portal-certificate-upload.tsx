"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { uploadPortalCertificateAction } from "./connect-adapter-actions";

export function PortalCertificateUpload({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);

  return (
    <form ref={formRef} className="space-y-3 rounded-xl border border-border p-4" onSubmit={(event) => {
      event.preventDefault();
      const form = formRef.current;
      if (!form) return;
      setError(undefined);
      setDone(false);
      start(async () => {
        const result = await uploadPortalCertificateAction(new FormData(form));
        if (!result.ok) {
          setError(result.message ?? "Não foi possível guardar o certificado.");
          return;
        }
        form.reset();
        setDone(true);
        router.refresh();
        onDone?.();
      });
    }}>
      <div>
        <p className="text-sm font-medium">Cadastrar certificado A1</p>
        <p className="mt-1 text-xs text-muted">O arquivo é validado e guardado cifrado. A senha do .pfx/.p12 nunca é exibida novamente.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Nome do certificado" htmlFor="portal-cert-label">
          <Input id="portal-cert-label" name="label" required maxLength={120} disabled={pending} placeholder="Certificado da advogada" />
        </Field>
        <Field label="Arquivo A1 (.pfx / .p12)" htmlFor="portal-cert-file">
          <Input id="portal-cert-file" name="file" type="file" accept=".pfx,.p12" required disabled={pending} />
        </Field>
        <Field label="Senha do arquivo" htmlFor="portal-cert-password">
          <Input id="portal-cert-password" name="password" type="password" required autoComplete="new-password" disabled={pending} />
        </Field>
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {done ? <Alert tone="success">Certificado guardado. Agora selecione-o no login do tribunal.</Alert> : null}
      <Button type="submit" variant="secondary" loading={pending}>Guardar certificado</Button>
    </form>
  );
}
