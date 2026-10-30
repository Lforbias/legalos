"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select, Textarea } from "@/components/ui/form";
import { IMPORT_MAX } from "@/lib/case-import";
import type { ActionState } from "@/lib/validation/common";
import { ClientPicker } from "@/modules/clients/client-picker";
import { createBoxV3ImportBatchAction } from "@/app/(dashboard)/box-v3/importacoes/actions";

export function BoxV3ImportForm({ canSelectClient }: { canSelectClient: boolean }) {
  const router = useRouter();
  const [value, setValue] = React.useState({ numbers: "", clientId: "", clientRole: "PLAINTIFF" });
  const [clientLabel, setClientLabel] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [numbersError, setNumbersError] = React.useState<string | undefined>();
  const [result, setResult] = React.useState<{ total: number; created: number } | null>(null);

  return (
    <form className="space-y-4" aria-label="Cadastrar processos em lote" onSubmit={(event) => {
      event.preventDefault();
      setError(null);
      setNumbersError(undefined);
      setResult(null);
      startTransition(async () => {
        const response: ActionState<{ id: string; total: number; created: number }> = await createBoxV3ImportBatchAction({ ...value, datajud: false, autos: false, updateExisting: false });
        if (!response.ok) {
          setError(response.message ?? "Não foi possível cadastrar o lote.");
          setNumbersError(response.fieldErrors?.numbers?.[0]);
          return;
        }
        setResult({ total: response.data!.total, created: response.data!.created });
        setValue({ numbers: "", clientId: "", clientRole: "PLAINTIFF" });
        setClientLabel("");
        router.refresh();
      });
    }}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {result ? <Alert tone="success">Lote concluído: {result.created} processo(s) cadastrado(s) de {result.total} número(s). Itens inválidos, repetidos ou já existentes aparecem no histórico.</Alert> : null}
      <Card>
        <CardHeader title="Cadastrar processos por número" description={`Um número CNJ por linha (ou separados por espaço, vírgula ou ponto e vírgula). Até ${IMPORT_MAX} números por lote.`} />
        <CardBody>
          <Field label="Números CNJ" htmlFor="box-v3-import-numbers" error={numbersError}>
            <Textarea id="box-v3-import-numbers" rows={7} value={value.numbers} onChange={(event) => setValue({ ...value, numbers: event.target.value })} placeholder={"0000000-00.2024.8.05.0001\n0000001-00.2024.8.05.0001"} />
          </Field>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Vínculo opcional" description="O cliente selecionado será cadastrado como parte dos processos novos deste lote." />
        <CardBody className="grid gap-3 md:grid-cols-2">
          {canSelectClient ? <Field label="Cliente (opcional)" htmlFor="box-v3-import-client"><ClientPicker id="box-v3-import-client" value={value.clientId} label={clientLabel} onChange={(clientId, label) => { setValue({ ...value, clientId }); setClientLabel(label); }} /></Field> : <p className="text-sm text-muted">Seu perfil permite cadastrar processos sem vincular um cliente nesta etapa.</p>}
          <Field label="Posição do cliente" htmlFor="box-v3-import-role"><Select id="box-v3-import-role" value={value.clientRole} onChange={(event) => setValue({ ...value, clientRole: event.target.value })}><option value="PLAINTIFF">Polo ativo (autor)</option><option value="DEFENDANT">Polo passivo (réu)</option><option value="THIRD_PARTY">Terceiro interessado</option><option value="OTHER">Outro</option></Select></Field>
        </CardBody>
      </Card>
      <Button type="submit" loading={pending} disabled={pending || value.numbers.trim().length < 10}>Cadastrar lote</Button>
    </form>
  );
}
