"use client";
import { BOX_AVAILABLE } from "@/lib/box-retirement";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select, Textarea } from "@/components/ui/form";
import { IMPORT_MAX } from "@/lib/case-import";
import { ClientPicker } from "@/modules/clients/client-picker";
import { createImportBatchAction } from "./actions";

export function ImportForm({ datajudReady, mniReady, canDocs }: { datajudReady: boolean; mniReady: boolean; canDocs: boolean }) {
  const router = useRouter();
  const [v, setV] = React.useState({ numbers: "", clientId: "", clientRole: "PLAINTIFF", datajud: datajudReady, autos: false, updateExisting: false });
  const [clientLabel, setClientLabel] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [numbersErr, setNumbersErr] = React.useState<string | undefined>();
  return (
    <form
      className="space-y-4"
      aria-label="Importar processos em lote"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setNumbersErr(undefined);
        startTransition(async () => {
          const res = await createImportBatchAction(v);
          if (!res.ok) {
            setError(res.message ?? "Não foi possível importar.");
            setNumbersErr(res.fieldErrors?.numbers?.[0]);
            return;
          }
          router.push(`/processos/importar/${res.data!.id}?auto=1`);
        });
      }}
    >
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Card>
        <CardHeader title="Números dos processos" description={`Um número CNJ por linha (ou separados por vírgula). Até ${IMPORT_MAX} por vez. Os que já existem não são duplicados.`} />
        <CardBody>
          <Field label="Números CNJ" htmlFor="imp-numbers" error={numbersErr}>
            <Textarea id="imp-numbers" rows={8} placeholder={"0000000-00.2024.8.05.0001\n0000001-00.2024.8.05.0001"} value={v.numbers} onChange={(e) => setV({ ...v, numbers: e.target.value })} />
          </Field>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Opções" />
        <CardBody className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Cliente dos processos (opcional)" htmlFor="imp-client" hint="Se informado, vira parte de todos os processos novos.">
              <ClientPicker id="imp-client" value={v.clientId} label={clientLabel} onChange={(id, label) => { setV({ ...v, clientId: id }); setClientLabel(label); }} />
            </Field>
            <Field label="Posição do cliente" htmlFor="imp-role">
              <Select id="imp-role" value={v.clientRole} onChange={(e) => setV({ ...v, clientRole: e.target.value })}>
                <option value="PLAINTIFF">Polo ativo (autor)</option>
                <option value="DEFENDANT">Polo passivo (réu)</option>
                <option value="THIRD_PARTY">Terceiro interessado</option>
                <option value="OTHER">Outro</option>
              </Select>
            </Field>
          </div>
          {BOX_AVAILABLE ? <>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={v.datajud} disabled={!datajudReady} onChange={(e) => setV({ ...v, datajud: e.target.checked })} />
            <span>Buscar os andamentos públicos no DataJud{datajudReady ? "" : " (indisponível: desligado ou sem chave neste escritório)"}. O número do processo é enviado ao CNJ.</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={v.autos} disabled={!canDocs || !mniReady} onChange={(e) => setV({ ...v, autos: e.target.checked })} />
            <span>Baixar os autos pelo MNI/PJe{mniReady ? "" : " (indisponível: nenhuma conexão ativa)"}. Só tribunais com conexão ativa; os demais ficam anotados como &ldquo;sem conexão&rdquo;.</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={v.updateExisting} onChange={(e) => setV({ ...v, updateExisting: e.target.checked })} />
            <span>Também atualizar (andamentos/autos) os processos que já estão cadastrados.</span>
          </label>
          </> : null}
        </CardBody>
      </Card>
      <Button type="submit" loading={pending} disabled={v.numbers.trim().length < 10}>Importar processos</Button>
    </form>
  );
}
