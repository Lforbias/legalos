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
  certificates,
  onDone,
}: {
  targets: AvailableTarget[];
  certificates: { id: string; label: string }[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const [selectedTarget, setSelectedTarget] = useState("");
  const [otp, setOtp] = useState("");
  const [certificateId, setCertificateId] = useState("");
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const [pending, start] = useTransition();

  const selection = targets.length === 1
    ? `${targets[0]!.adapterKey}|${targets[0]!.targetKey}`
    : selectedTarget;
  const selected = targets.find(
    (t) => `${t.adapterKey}|${t.targetKey}` === selection,
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
            targetKey: selected.targetKey,
            certificateId,
            otp,
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
          setOtp("");
          setCertificateId("");
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
          value={selection}
          onChange={(e) => setSelectedTarget(e.target.value)}
          required
          disabled={pending}
        >
          <option value="">Escolha o tribunal…</option>
          {targets.map((t) => (
            <option
              key={`${t.adapterKey}|${t.targetKey}`}
              value={`${t.adapterKey}|${t.targetKey}`}
            >
              {t.courtCode} · {t.degreeLabel} — {t.adapterLabel}
            </option>
          ))}
        </Select>
      </Field>

      {selected && (
        <>
          <Field label="Certificado digital A1" htmlFor="adapter-certificate" hint="Escolha um certificado válido do cofre ou cadastre um arquivo .pfx/.p12 acima.">
            <Select id="adapter-certificate" value={certificateId} onChange={(e) => setCertificateId(e.target.value)} required disabled={pending || certificates.length === 0}>
              <option value="">Selecione o certificado…</option>
              {certificates.map((certificate) => <option key={certificate.id} value={certificate.id}>{certificate.label}</option>)}
            </Select>
          </Field>

          <div className="rounded-xl border border-border p-3 text-xs text-muted">
            Login somente por certificado digital A1. A senha é a do arquivo .pfx/.p12, solicitada apenas ao cadastrar o certificado no cofre.
            Certificado A3 em token físico/cartão não pode ser usado pelo navegador remoto do Legal OS.
          </div>

          <Field
            label="Chave do autenticador (obrigatória)"
            htmlFor="adapter-otp"
            hint="Informe a chave de configuração Base32 ou o endereço otpauth do aplicativo autenticador. O Legal OS gera o código temporário e guarda a chave cifrada."
          >
            <Input
              id="adapter-otp"
              type="password"
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              autoComplete="off"
              maxLength={2048}
              disabled={pending}
            />
          </Field>

          <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted">
            <p>
              O teste usa o login oficial do destino escolhido; ainda não foi homologado. CAPTCHA, bloqueio ou
              autenticação que exija ação humana interrompem o teste; não há tentativa de
              contornar esses controles. O resultado só aparece após o worker verificar o acesso.
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
          disabled={!selection || !certificateId || !otp || (certificates.length === 0)}
        >
          Salvar e conectar
        </Button>
      </div>
    </form>
  );
}
