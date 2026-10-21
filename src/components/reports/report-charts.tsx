"use client";

import { formatMoneyBR } from "@/lib/validation/money";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type Series = { key: string; label: string; color: "primary" | "accent" | "danger" };
const COLOR = { primary: "var(--primary)", accent: "var(--accent)", danger: "var(--danger)" } as const;

export type Unit = "number" | "money";
const fmtFor = (u: Unit, short = false) => (n: number): string => (u === "money" ? (short ? (Math.abs(n) >= 1000 ? `${Math.round(n / 100) / 10}k` : String(Math.round(n))) : formatMoneyBR(n.toFixed(2))) : String(n));

type Datum = Record<string, string | number>;

function Tip({ active, payload, label, series, fmt }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string; series: Series[]; fmt: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-lg">
      <div className="mb-1 text-muted">{label}</div>
      {series.map((s) => {
        const v = payload.find((p) => p.dataKey === s.key)?.value ?? 0;
        return (
          <div key={s.key} className="flex items-center gap-1.5 tabular-nums">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: COLOR[s.color] }} aria-hidden />
            <span className="text-muted">{s.label}:</span>
            <span className="font-semibold">{fmt(v)}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Barras verticais com 1 ou 2 séries (agrupadas). Com 2 séries há legenda; sempre há tabela equivalente (acessibilidade).
 * `format` formata o valor (número ou dinheiro); os dados chegam como números.
 */
export function ReportBars({ title, data, series, xKey = "label", unit = "number" }: { title: string; data: Datum[]; series: Series[]; xKey?: string; unit?: Unit }) {
  const format = fmtFor(unit, true);
  const f = fmtFor(unit);
  return (
    <div>
      {series.length > 1 ? (
        <ul className="mb-2 flex flex-wrap gap-3 text-xs text-muted" aria-label="Legenda">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR[s.color] }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="h-56 w-full" role="img" aria-label={title}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} width={48} tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} tickFormatter={(n: number) => format(n)} />
            <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<Tip series={series} fmt={format} />} />
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={COLOR[s.color]} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer">Ver como tabela</summary>
        <table className="mt-2 w-full">
          <thead>
            <tr className="text-left">
              <th className="py-1 font-medium">{title}</th>
              {series.map((s) => (
                <th key={s.key} className="py-1 text-right font-medium">{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={String(d[xKey])}>
                <td className="py-0.5">{String(d[xKey])}</td>
                {series.map((s) => (
                  <td key={s.key} className="py-0.5 text-right tabular-nums">{f(Number(d[s.key] ?? 0))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** Ranking horizontal rotulado (identidade pelo rótulo, valor ao lado), sem cor para distinguir itens. */
export function RankList({ items, unit = "number", empty = "Sem dados no período." }: { items: { label: string; value: number }[]; unit?: Unit; empty?: string }) {
  const format = fmtFor(unit);
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-1.5">
      {items.map((i) => (
        <li key={i.label} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">{i.label}</span>
            <span className="shrink-0 tabular-nums text-muted">{format(i.value)}</span>
          </div>
          <div className="mt-0.5 h-1.5 rounded-full bg-surface-2" aria-hidden>
            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(2, (i.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
