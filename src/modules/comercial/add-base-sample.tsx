"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { addBaseSampleAction } from "./actions";
import { useRun } from "./use-run";

export function AddBaseSample() {
  const { run, pending, error } = useRun();
  const [message, setMessage] = useState("");
  return <div className="space-y-2 rounded-lg border border-border bg-surface p-4">
    <p className="text-sm">Leve a amostra da Receita para o funil e a lista comercial. Cadastros existentes são preservados; coordenadas pendentes continuam identificadas.</p>
    <Button size="sm" loading={pending} onClick={() => run(() => addBaseSampleAction(), data => data && setMessage(`${data.created} adicionados; ${data.existing} já estavam cadastrados.`))}>Adicionar amostra ao Comercial (até 200)</Button>
    {message && <p role="status" className="text-sm">{message}</p>}
    {error && <Alert tone="error">{error}</Alert>}
  </div>;
}
