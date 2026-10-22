"use client";

import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { useRun } from "@/modules/kanban/use-run";
import { loadTablesAction, setIndexAction, syncIndexesAction } from "./actions";

const SERIES: [string, string][] = [
  ["IPCAE", "IPCA-E (% ao mês)"], ["TR", "TR (% ao mês)"], ["TJSP", "Tabela Prática TJSP (fator)"], ["REAJUSTE_INSS", "Reajuste anual do INSS (%, mês 01)"], ["SALMIN", "Salário mínimo (R$)"],
  ["INPC", "INPC (% ao mês)"], ["SELIC", "SELIC (% ao mês)"], ["IPCA", "IPCA (% ao mês)"],
];

export function IndexesPanel({ canManage }: { canManage: boolean }) {
  const { run, pending, error, done } = useRun();
  const [years, setYears] = React.useState("20");
  const [msg, setMsg] = React.useState<string | null>(null);
  if (!canManage) return <Alert tone="info">Só quem administra o financeiro altera os índices.</Alert>;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Buscar no Banco Central (anos)" htmlFor="ix-years"><Input id="ix-years" className="w-24" value={years} onChange={(e) => setYears(e.target.value)} inputMode="numeric" /></Field>
        <Button variant="secondary" loading={pending} onClick={() => run(() => syncIndexesAction(Number(years) || 20), undefined, (d) => setMsg(d ? Object.entries(d).map(([s, v]) => `${s}: ${v.error ? `falhou (${v.error})` : `${v.saved} meses`}`).join(" · ") : null))}>Sincronizar INPC, IPCA e SELIC</Button>
        <Button variant="secondary" loading={pending} onClick={() => run(() => loadTablesAction(), "Tabelas carregadas.")}>Carregar tabelas do escritório (TJSP e reajuste INSS)</Button>
      </div>
      {msg ? <Alert tone="info">{msg}</Alert> : null}
      <form
        className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() => setIndexAction({ series: fd.get("series"), month: fd.get("month"), value: fd.get("value") }), "Índice salvo.");
        }}
      >
        <Field label="Série" htmlFor="ix-series"><Select id="ix-series" name="series">{SERIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label="Mês" htmlFor="ix-month"><Input id="ix-month" name="month" type="month" required /></Field>
        <Field label="Valor" htmlFor="ix-value"><Input id="ix-value" name="value" placeholder="0,46" required /></Field>
        <Button type="submit" loading={pending}>Salvar</Button>
      </form>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {done ? <Alert tone="success">{done}</Alert> : null}
    </div>
  );
}
