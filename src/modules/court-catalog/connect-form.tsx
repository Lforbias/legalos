"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { connectAdapterAction, type ConnectAdapterInput } from "./connect-adapter-actions";
import type { AvailableTarget } from "./connection-actions";

export function ConnectAdapterForm({
  targets,
  onDone,
}: {
  targets: AvailableTarget[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const [selectedTarget, setSelectedTarget] = useState("");
  const [document_, setDocument] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const [pending, start] = useTransition();

  const selected = targets.find(
    (t) => `${t.adapterKey}|${t.courtCode}|${t.degree}` === selectedTarget,
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!selected) return;
        setError(undefined);
        setDone(undefined);
        start(async () => {
          const input: ConnectAdapterInput = {
            adapterKey: selected.adapterKey,
            courtCode: selected.courtCode,
            degree: selected.degree as "1" | "2",
            document: document_,
            password,
          };
          const res = await connectAdapterAction(input);
          if (!res.ok) {
            setError(
              res.message ??
                Object.values(res.fieldErrors ?? {}).flat()[0] ??
                "Não foi possível salvar.",
            );
            return;
          }
          setPassword("");
          setDone(
            "Salvo. O teste de conexão foi colocado na fila. O resultado aparece quando o worker processar.",
          );
          router.refresh();
          onDone?.();
        });
      }}
    >
      <Field label="Tribunal e grau" htmlFor="adapter-target">
        <Select
          id="adapter-target"
          value={selectedTarget}
          onChange={(e) => setSelectedTarget(e.target.value)}
          required
          disabled={pending}
        >
          <option value="">Escolha o tribunal…</option>
          {targets.map((t) => (
            <option
              key={`${t.adapterKey}|${t.courtCode}|${t.degree}`}
              value={`${t.adapterKey}|${t.courtCode}|${t.degree}`}
            >
              {t.courtCode} · {t.degreeLabel} — {t.adapterLabel}
            </option>
          ))}
        </Select>
      </Field>

      {selected && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Field
              label="CPF (ou CNPJ)"
              htmlFor="adapter-doc"
              hint="Login usado no tribunal."
            >
              <Input
                id="adapter-doc"
                value={document_}
                onChange={(e) => setDocument(e.target.value)}
                required
                inputMode="numeric"
                autoComplete="off"
                maxLength={20}
                disabled={pending}
                placeholder="000.000.000-00"
              />
            </Field>
            <Field
              label="Senha"
              htmlFor="adapter-pass"
              hint="Cifrada no cofre. Nunca volta para a tela."
            >
              <Input
                id="adapter-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                maxLength={200}
                disabled={pending}
              />
            </Field>
          </div>

          <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted">
            <p>
              O adaptador <strong>{selected.adapterLabel}</strong> usa o protocolo MNI
              2.2.2. As credenciais são as mesmas do login no tribunal. O teste de
              conexão só será possível quando o endpoint MNI do tribunal for confirmado.
            </p>
          </div>
        </>
      )}

      {error ? <Alert tone="error">{error}</Alert> : null}
      {done ? <Alert tone="success">{done}</Alert> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          loading={pending}
          disabled={!selectedTarget || !document_ || !password}
        >
          Salvar e conectar
        </Button>
      </div>
    </form>
  );
}
