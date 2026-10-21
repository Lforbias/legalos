"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Tip = { active?: boolean; payload?: { value: number; payload: { label: string } }[]; unit: string };

function ChartTooltip({ active, payload, unit }: Tip) {
  const item = payload?.[0];
  if (!active || !item) return null;
  return (
    <div className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-lg">
      <div className="text-muted">{item.payload.label}</div>
      <div className="font-semibold tabular-nums">
        {item.value} {unit}
      </div>
    </div>
  );
}

/** Série única: barras finas com extremidade arredondada; o título do cartão nomeia a série. */
export function ActivityChart({ data }: { data: { label: string; value: number }[] }) {
  return (
    <div>
      <div className="h-52 w-full" role="img" aria-label="Eventos de auditoria por dia nos últimos 14 dias">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="2 4" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
            <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<ChartTooltip unit="eventos" />} />
            <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer">Ver como tabela</summary>
        <table className="mt-2 w-full">
          <thead>
            <tr className="text-left">
              <th className="py-1 font-medium">Dia</th>
              <th className="py-1 text-right font-medium">Eventos</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <td className="py-0.5">{d.label}</td>
                <td className="py-0.5 text-right tabular-nums">{d.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** Barras horizontais rotuladas (identidade pelo rótulo, não pela cor). */
export function RoleChart({ data }: { data: { label: string; value: number }[] }) {
  const height = Math.max(120, data.length * 34 + 16);
  return (
    <div>
      <div style={{ height }} className="w-full" role="img" aria-label="Membros por perfil de acesso">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
            <XAxis type="number" allowDecimals={false} domain={[0, "dataMax"]} hide />
            <YAxis type="category" dataKey="label" width={130} tickLine={false} axisLine={false} tick={{ fill: "var(--fg)", fontSize: 12 }} />
            <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<ChartTooltip unit="membros" />} />
            <Bar dataKey="value" fill="var(--accent)" radius={[0, 4, 4, 0]} maxBarSize={16} label={{ position: "right", fill: "var(--muted)", fontSize: 11 }} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
