"use client";

import Link from "next/link";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import type { CalcResult } from "@/lib/calc/num";
import { JF_BENEFIT_LABEL, JF_BENEFIT_TYPES } from "@/lib/calc/jf";
import { TJSP_METHOD_LABEL, TJSP_METHODS } from "@/lib/calc/tjsp";
import { TERMINATION_LABEL, TERMINATION_TYPES } from "@/lib/calc/trabalhista";
import { ACTS } from "@/lib/calc/prazos";
import { runCalcAction, saveCalcAction } from "./actions";
import { CalcResultView } from "./result-view";
import type { CalcKind } from "./schemas";

type F = { name: string; label: string; type?: "text" | "date" | "money" | "select" | "check" | "number"; options?: [string, string][]; hint?: string; defaultValue?: string };
type RowF = { name: string; label: string; type: "text" | "date" | "money"; wide?: boolean };

const BASE_DATE = (): string => new Date().toISOString().slice(0, 10);

const FIELDS: Record<CalcKind, { fields: F[]; rows?: { key: string; label: string; add: string; cols: RowF[] } }> = {
  JF_ATRASADOS: {
    fields: [
      { name: "processo", label: "Processo (opcional)" }, { name: "autor", label: "Autor (opcional)" },
      { name: "benefitType", label: "Tipo de benefício", type: "select", options: JF_BENEFIT_TYPES.map((k) => [k, JF_BENEFIT_LABEL[k]]) },
      { name: "rmi", label: "RMI (R$)", type: "money", hint: "Não vale no BPC/LOAS (usa o salário mínimo cadastrado)." },
      { name: "percent", label: "Percentual do benefício (%)", hint: "Em branco: 100% (50% no auxílio-acidente)." },
      { name: "dib", label: "DIB", type: "date" }, { name: "dip", label: "DIP", type: "date", hint: "Os atrasados vão até o mês anterior à DIP." },
      { name: "citacao", label: "Data da citação", type: "date", hint: "Obrigatória só se houver parcelas anteriores a 30/06/2009." },
      { name: "dataBase", label: "Atualizar até", type: "date", defaultValue: BASE_DATE() },
      { name: "deducao", label: "Valor a deduzir (R$)", type: "money" },
      { name: "decimoTerceiro", label: "Incluir 13º (abono anual)", type: "check" },
    ],
  },
  TJSP: {
    fields: [
      { name: "processo", label: "Processo (opcional)" },
      { name: "metodo", label: "Metodologia da sentença", type: "select", options: TJSP_METHODS.map((k) => [k, TJSP_METHOD_LABEL[k]]) },
      { name: "dataBase", label: "Atualizar até (mês da tabela)", type: "date", defaultValue: BASE_DATE() },
      { name: "jurosMensais", label: "Juros mensais simples (%)", hint: "Em branco: 1%. Fazenda Pública: 0,5." },
      { name: "honorariosPercent", label: "Honorários (%)", hint: "Só se a sentença determinar." },
      { name: "multa10", label: "Multa de 10% (art. 523, §1º, CPC)", type: "check" },
    ],
    rows: { key: "itens", label: "Valores a atualizar", add: "Adicionar valor", cols: [{ name: "descricao", label: "Descrição", type: "text", wide: true }, { name: "valor", label: "Valor (R$)", type: "money" }, { name: "vencimento", label: "Vencimento", type: "date" }] },
  },
  TRABALHISTA: {
    fields: [
      { name: "processo", label: "Processo (opcional)" }, { name: "reclamante", label: "Reclamante (opcional)" },
      { name: "ajuizamento", label: "Ajuizamento da reclamação", type: "date", hint: "1ª instância, não a data do recurso." },
      { name: "dataBase", label: "Atualizar até", type: "date", defaultValue: BASE_DATE() },
      { name: "honorariosPercent", label: "Honorários do reclamante (%)", hint: "Os fixados a favor do procurador do reclamante." },
    ],
    rows: { key: "itens", label: "Verbas condenadas", add: "Adicionar verba", cols: [{ name: "nome", label: "Verba", type: "text", wide: true }, { name: "competencia", label: "Competência (qualquer dia do mês)", type: "date" }, { name: "valor", label: "Valor (R$)", type: "money" }] },
  },
  RESCISAO: {
    fields: [
      { name: "reclamante", label: "Empregado (opcional)" },
      { name: "tipo", label: "Tipo de rescisão", type: "select", options: TERMINATION_TYPES.map((k) => [k, TERMINATION_LABEL[k]]) },
      { name: "admissao", label: "Admissão", type: "date" }, { name: "demissao", label: "Demissão", type: "date" },
      { name: "salario", label: "Último salário (R$)", type: "money" },
      { name: "feriasVencidas", label: "Períodos de férias vencidas", type: "number", defaultValue: "0" },
      { name: "saldoFgts", label: "Saldo do FGTS (R$)", type: "money", hint: "Sem o extrato, o sistema estima e avisa." },
      { name: "incontroverso", label: "Valor incontroverso não pago (R$)", type: "money", hint: "Para a multa do art. 467." },
      { name: "atrasoPagamento", label: "Pagamento fora do prazo (art. 477)", type: "check" },
    ],
  },
  PRAZO: {
    fields: [
      { name: "processo", label: "Processo (opcional)" },
      { name: "actKey", label: "Ato", type: "select", options: ACTS.map((a) => [a.key, `${a.label} — ${a.days} dias ${a.type === "BUSINESS" ? "úteis" : "corridos"} (${a.basis})`]) },
      { name: "intimacao", label: "Data da intimação/publicação", type: "date" },
    ],
  },
};

export function CalculatorForm({ kind, caseId, caseLabel }: { kind: CalcKind; caseId: string | null; caseLabel?: string }) {
  const spec = FIELDS[kind];
  const [rows, setRows] = React.useState<Record<string, string>[]>(spec.rows ? [{}] : []);
  const [result, setResult] = React.useState<CalcResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [savedId, setSavedId] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const formRef = React.useRef<HTMLFormElement>(null);

  const payload = () => {
    const fd = new FormData(formRef.current!);
    const o: Record<string, unknown> = {};
    for (const f of spec.fields) o[f.name] = f.type === "check" ? fd.get(f.name) === "on" : String(fd.get(f.name) ?? "");
    if (spec.rows) o[spec.rows.key] = rows.map((r) => Object.fromEntries(spec.rows!.cols.map((c) => [c.name, (r[c.name] ?? "").toString()])));
    return o;
  };
  const run = () => start(async () => {
    setSavedId(null);
    const r = await runCalcAction(kind, payload());
    if (!r.ok) { setError(Object.values(r.fieldErrors ?? {})[0]?.[0] ?? r.message ?? "Não foi possível calcular."); setResult(null); }
    else { setError(null); setResult(r.data ?? null); }
  });
  const save = () => start(async () => {
    const r = await saveCalcAction(kind, payload(), caseId);
    if (!r.ok) setError(Object.values(r.fieldErrors ?? {})[0]?.[0] ?? r.message ?? "Não foi possível salvar.");
    else { setError(null); setSavedId(r.data?.id ?? null); }
  });

  return (
    <div className="space-y-5">
      {caseLabel ? <Alert tone="info">O cálculo será salvo no processo: {caseLabel}.</Alert> : null}
      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); run(); }} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {spec.fields.map((f) => (
            <Field key={f.name} label={f.label} htmlFor={`c-${f.name}`} hint={f.hint}>
              {f.type === "select" ? (
                <Select id={`c-${f.name}`} name={f.name}>{f.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
              ) : f.type === "check" ? (
                <label className="flex h-9 items-center gap-2 text-sm"><input id={`c-${f.name}`} type="checkbox" name={f.name} /> Sim</label>
              ) : (
                <Input id={`c-${f.name}`} name={f.name} type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"} inputMode={f.type === "money" ? "decimal" : undefined} defaultValue={f.defaultValue} placeholder={f.type === "money" ? "0,00" : undefined} />
              )}
            </Field>
          ))}
        </div>
        {spec.rows ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted">{spec.rows.label}</p>
            {rows.map((r, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
                {spec.rows!.cols.map((c) => (
                  <Input key={c.name} aria-label={c.label} placeholder={c.label} type={c.type === "date" ? "date" : "text"} inputMode={c.type === "money" ? "decimal" : undefined} value={r[c.name] ?? ""} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, [c.name]: e.target.value } : x)))} />
                ))}
                <Button type="button" variant="ghost" size="sm" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs))} aria-label="Remover linha">Remover</Button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={() => setRows((rs) => [...rs, {}])}>{spec.rows.add}</Button>
          </div>
        ) : null}
        {error ? <Alert tone="error">{error}</Alert> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={pending}>Calcular</Button>
          {result ? <Button type="button" variant="secondary" onClick={save} loading={pending}>{caseId ? "Salvar no processo" : "Salvar cálculo"}</Button> : null}
        </div>
      </form>
      {savedId ? <Alert tone="success">Cálculo salvo. <Link className="underline" href={`/calculos/${savedId}`}>Abrir e baixar a planilha</Link></Alert> : null}
      {result ? <CalcResultView result={result} /> : null}
    </div>
  );
}
