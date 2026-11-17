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
import { createImportBatchAction, previewImportBatchAction, previewProcessSheetAction } from "./actions";

type ImportPreview = {
  rows: { raw: string; number: string | null; status: "NEW" | "EXISTS" | "DUPLICATE" | "INVALID"; message: string | null }[];
  totals: { total: number; new: number; exists: number; duplicate: number; invalid: number };
};

export function ImportForm({ datajudReady, mniReady, canDocs }: { datajudReady: boolean; mniReady: boolean; canDocs: boolean }) {
  const router = useRouter();
  const [v, setV] = React.useState({ numbers: "", clientId: "", clientRole: "PLAINTIFF", datajud: datajudReady, autos: false, updateExisting: false });
  const [clientLabel, setClientLabel] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [numbersErr, setNumbersErr] = React.useState<string | undefined>();
  const [readingSheet, readSheet] = React.useTransition();
  const [reviewing, startReview] = React.useTransition();
  const [columns, setColumns] = React.useState<{ name: string; values: string[]; total: number }[]>([]);
  const [columnIndex, setColumnIndex] = React.useState("0");
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [previewKey, setPreviewKey] = React.useState("");
  const selectedColumn = columns[Number(columnIndex)];
  const currentKey = JSON.stringify(v);
  const previewIsCurrent = Boolean(preview && previewKey === currentKey);
  const update = (next: typeof v) => {
    setV(next);
    setPreview(null);
    setPreviewKey("");
  };

  function reviewImport() {
    setError(null);
    startReview(async () => {
      try {
        const result = await previewImportBatchAction(v);
        if (!result.ok || !result.data) {
          setError(result.message ?? "Não foi possível preparar a revisão.");
          setNumbersErr(result.fieldErrors?.numbers?.[0]);
          setPreview(null);
          setPreviewKey("");
          return;
        }
        setNumbersErr(undefined);
        setPreview(result.data);
        setPreviewKey(currentKey);
      } catch {
        setError("Não foi possível preparar a revisão. Tente novamente.");
        setPreview(null);
        setPreviewKey("");
      }
    });
  }

  return (
    <form
      className="space-y-4"
      aria-label="Importar processos em lote"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setNumbersErr(undefined);
        if (!previewIsCurrent) {
          setError("Revise a lista atual antes de confirmar a importação.");
          return;
        }
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
        <CardBody className="space-y-3">
          <Field label="Carregar CSV ou Excel" htmlFor="imp-sheet" hint="Até 512 KB. Para Excel (.xlsx), use a primeira aba visível, com cabeçalho e CNJs como texto.">
            <input id="imp-sheet" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={pending || readingSheet} onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setError(null);
              setColumns([]);
              setColumnIndex("0");
              if (file.size > 512 * 1024) {
                setError("Selecione um CSV ou Excel (.xlsx) de até 512 KB.");
                return;
              }
              const form = new FormData();
              form.set("file", file);
              readSheet(async () => {
                try {
                  const result = await previewProcessSheetAction(form);
                  if (result.ok && result.data) setColumns(result.data.columns);
                  else setError(result.message ?? "Não foi possível ler o arquivo.");
                } catch {
                  setError("Não foi possível carregar o arquivo. Tente novamente.");
                }
              });
            }} />
          </Field>
          {selectedColumn ? (
            <div className="space-y-2">
              <Field label="Coluna com o número CNJ" htmlFor="imp-sheet-column">
                <Select id="imp-sheet-column" value={columnIndex} onChange={(event) => setColumnIndex(event.target.value)}>
                  {columns.map((column, index) => <option key={column.name} value={index}>{column.name} ({column.total})</option>)}
                </Select>
              </Field>
              {selectedColumn.total > IMPORT_MAX ? <p className="text-sm text-warning">A coluna tem {selectedColumn.total} valores. Divida a planilha em arquivos de até {IMPORT_MAX} processos.</p> : null}
              <Button type="button" size="sm" variant="secondary" disabled={pending || selectedColumn.total > IMPORT_MAX} onClick={() => {
                update({ ...v, numbers: selectedColumn.values.join("\n") });
                setNumbersErr(undefined);
              }}>Carregar números para revisão</Button>
            </div>
          ) : null}
          <Field label="Números CNJ" htmlFor="imp-numbers" error={numbersErr}>
            <Textarea id="imp-numbers" rows={8} placeholder={"0000000-00.2024.8.05.0001\n0000001-00.2024.8.05.0001"} value={v.numbers} onChange={(e) => update({ ...v, numbers: e.target.value })} />
          </Field>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Opções" />
        <CardBody className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Cliente dos processos (opcional)" htmlFor="imp-client" hint="Se informado, vira parte de todos os processos novos.">
              <ClientPicker id="imp-client" value={v.clientId} label={clientLabel} onChange={(id, label) => { update({ ...v, clientId: id }); setClientLabel(label); }} />
            </Field>
            <Field label="Posição do cliente" htmlFor="imp-role">
              <Select id="imp-role" value={v.clientRole} onChange={(e) => update({ ...v, clientRole: e.target.value })}>
                <option value="PLAINTIFF">Polo ativo (autor)</option>
                <option value="DEFENDANT">Polo passivo (réu)</option>
                <option value="THIRD_PARTY">Terceiro interessado</option>
                <option value="OTHER">Outro</option>
              </Select>
            </Field>
          </div>
          {BOX_AVAILABLE ? <>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={v.datajud} disabled={!datajudReady} onChange={(e) => update({ ...v, datajud: e.target.checked })} />
            <span>Buscar os andamentos públicos no DataJud{datajudReady ? "" : " (indisponível: desligado ou sem chave neste escritório)"}. O número do processo é enviado ao CNJ.</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={v.autos} disabled={!canDocs || !mniReady} onChange={(e) => update({ ...v, autos: e.target.checked })} />
            <span>Baixar os autos pelo MNI/PJe{mniReady ? "" : " (indisponível: nenhuma conexão ativa)"}. Só tribunais com conexão ativa; os demais ficam anotados como &ldquo;sem conexão&rdquo;.</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={v.updateExisting} onChange={(e) => update({ ...v, updateExisting: e.target.checked })} />
            <span>Também atualizar (andamentos/autos) os processos que já estão cadastrados.</span>
          </label>
          </> : null}
        </CardBody>
      </Card>
      {previewIsCurrent && preview ? (
        <Card>
          <CardHeader title="Revisão da importação" description="Confira os números válidos, repetidos e já cadastrados antes de confirmar. Itens inválidos e repetidos na planilha não serão criados." />
          <CardBody className="space-y-3">
            <p className="text-sm">{preview.totals.total} lidos · {preview.totals.new} novos · {preview.totals.exists} já cadastrados · {preview.totals.duplicate} repetidos na lista · {preview.totals.invalid} inválidos</p>
            <div className="max-h-64 overflow-auto rounded-md border border-border">
              <ul className="divide-y divide-border text-sm">
                {preview.rows.map((row, index) => (
                  <li key={`${index}-${row.raw}`} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                    <span className="font-mono">{row.number ?? row.raw}</span>
                    <span className={row.status === "NEW" ? "text-success" : "text-muted"}>
                      {row.status === "NEW" ? "Novo" : row.status === "EXISTS" ? "Já cadastrado" : row.status === "DUPLICATE" ? "Duplicado na planilha" : row.message ?? "Inválido"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </CardBody>
        </Card>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" loading={reviewing} disabled={pending || readingSheet || v.numbers.trim().length < 10} onClick={reviewImport}>Revisar importação</Button>
        <Button type="submit" loading={pending} disabled={reviewing || !previewIsCurrent || !(preview?.totals.new || (v.updateExisting && preview?.totals.exists))}>Confirmar e importar</Button>
      </div>
    </form>
  );
}
