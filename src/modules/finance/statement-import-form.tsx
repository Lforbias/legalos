"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form";
import { formatMoneyBR } from "@/lib/validation/money";
import { previewMappedStatementAction, previewStatementFileAction } from "./reconciliation-actions";

type Mapping = { date: string; description: string; amount: string; reference: string; direction: string };
type Accounts = { id: string; name: string }[];
type Preview = { valid: number; invalid: number; repeated: number; sample: { postedOn: string; description: string; amount: string; direction: string; duplicate: boolean }[] };

const norm = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const firstMatch = (headers: string[], terms: string[]) => headers.find((header) => terms.some((term) => norm(header).includes(term))) ?? "";

export function StatementImportForm({ accounts }: { accounts: Accounts }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>({ date: "", description: "", amount: "", reference: "", direction: "" });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingFile, startFile] = useTransition();
  const [reviewing, startReview] = useTransition();
  const [saving, startSave] = useTransition();

  function buildForm() {
    const form = new FormData();
    if (file) form.set("file", file);
    form.set("accountId", accountId);
    form.set("date", mapping.date);
    form.set("description", mapping.description);
    form.set("amount", mapping.amount);
    form.set("reference", mapping.reference);
    form.set("direction", mapping.direction);
    return form;
  }

  function chooseFile(next: File | null) {
    setFile(next);
    setHeaders([]);
    setPreview(null);
    setError(null);
    if (!next) return;
    if (!next.name.toLowerCase().endsWith(".csv") || next.size > 8 * 1024 * 1024) {
      setFile(null);
      setError("Selecione um CSV de até 8 MB.");
      return;
    }
    const form = new FormData();
    form.set("file", next);
    startFile(async () => {
      try {
        const result = await previewStatementFileAction(form);
        if (!result.ok || !result.data) {
          setError(result.message ?? "Não foi possível ler o extrato.");
          setFile(null);
          return;
        }
        const available = result.data.headers;
        setHeaders(available);
        setMapping({
          date: firstMatch(available, ["data", "date"]),
          description: firstMatch(available, ["descricao", "historico", "memo", "description"]),
          amount: firstMatch(available, ["valor", "amount", "montante"]),
          reference: firstMatch(available, ["id", "referencia", "documento", "nsu"]),
          direction: firstMatch(available, ["tipo", "natureza", "direcao", "direction"]),
        });
      } catch {
        setError("Não foi possível ler o CSV. Verifique o arquivo e tente novamente.");
        setFile(null);
      }
    });
  }

  function review() {
    setError(null);
    setPreview(null);
    startReview(async () => {
      try {
        const result = await previewMappedStatementAction(buildForm());
        if (!result.ok || !result.data) {
          setError(result.message ?? "Não foi possível analisar as linhas.");
          return;
        }
        setPreview(result.data);
      } catch {
        setError("Não foi possível analisar as linhas. Tente novamente.");
      }
    });
  }

  function importFile() {
    setError(null);
    startSave(async () => {
      try {
        const response = await fetch("/api/financeiro/conciliacao", { method: "POST", body: buildForm() });
        const result = await response.json() as { id?: string; imported?: number; duplicates?: number; invalid?: number; error?: string };
        if (!response.ok || !result.id) {
          setError(result.error ?? "Não foi possível importar o extrato.");
          return;
        }
        router.push(`/financeiro/conciliacao?importacao=${result.id}`);
      } catch {
        setError("Falha de comunicação ao importar. Tente novamente.");
      }
    });
  }

  return (
    <Card>
      <CardHeader title="Importar extrato CSV" description="Importe primeiro para revisão. Nenhuma baixa é registrada até você confirmar o vínculo com um lançamento." />
      <CardBody className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {accounts.length === 0 ? <Alert tone="warning">Cadastre uma conta em Financeiro → Cadastros antes de importar um extrato.</Alert> : null}
        <Field label="Conta financeira" htmlFor="statement-account">
          <Select id="statement-account" value={accountId} onChange={(event) => { setAccountId(event.target.value); setPreview(null); }} disabled={accounts.length === 0}>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </Select>
        </Field>
        <Field label="Arquivo CSV" htmlFor="statement-file" hint="Até 8 MB. Valor positivo representa entrada e negativo representa saída, salvo se houver coluna de direção.">
          <input id="statement-file" type="file" accept=".csv,text/csv" disabled={loadingFile || saving} onChange={(event) => { const selected = event.target.files?.[0] ?? null; event.target.value = ""; chooseFile(selected); }} />
        </Field>
        {headers.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ["date", "Coluna de data", true],
              ["description", "Coluna de descrição", true],
              ["amount", "Coluna de valor", true],
              ["direction", "Coluna de direção (opcional)", false],
              ["reference", "Coluna de identificador (opcional)", false],
            ] as const).map(([key, label, required]) => (
              <Field key={key} label={label} htmlFor={`statement-${key}`}>
                <Select id={`statement-${key}`} value={mapping[key]} onChange={(event) => { setMapping((current) => ({ ...current, [key]: event.target.value })); setPreview(null); }}>
                  {!required ? <option value="">Usar valor assinado / sem identificador</option> : null}
                  {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                </Select>
              </Field>
            ))}
          </div>
        ) : null}
        {preview ? (
          <div className="space-y-3 rounded-md border border-border p-3">
            <p className="text-sm font-medium">{preview.valid} linhas válidas · {preview.invalid} inválidas · {preview.repeated} repetidas neste arquivo</p>
            {preview.sample.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-muted"><tr><th className="p-2">Data</th><th className="p-2">Descrição</th><th className="p-2">Direção</th><th className="p-2 text-right">Valor</th></tr></thead>
                  <tbody className="divide-y divide-border">{preview.sample.map((line, index) => <tr key={`${line.postedOn}-${index}`} className={line.duplicate ? "text-muted" : undefined}><td className="p-2">{line.postedOn}</td><td className="max-w-64 truncate p-2">{line.description}{line.duplicate ? " · duplicada" : ""}</td><td className="p-2">{line.direction === "RECEIVABLE" ? "Entrada" : "Saída"}</td><td className="p-2 text-right">{formatMoneyBR(line.amount)}</td></tr>)}</tbody>
                </table>
              </div>
            ) : null}
            <Button type="button" loading={saving} disabled={saving || preview.valid === 0 || accounts.length === 0} onClick={importFile}>Importar linhas pendentes</Button>
          </div>
        ) : null}
        {headers.length && !preview ? <Button type="button" variant="secondary" loading={reviewing} disabled={reviewing || !mapping.date || !mapping.description || !mapping.amount || !accountId} onClick={review}>Analisar e revisar linhas</Button> : null}
      </CardBody>
    </Card>
  );
}
