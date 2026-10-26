import { brl } from "@/lib/comercial/format";
import type { ProjectionSeries } from "@/lib/comercial/projection";

const STYLE: Record<string, { stroke: string; dash?: string }> = {
  conservador: { stroke: "#64748b", dash: "6 4" },
  realista: { stroke: "var(--primary)" },
  otimista: { stroke: "#16a34a", dash: "2 4" },
};

function monthLabels(n: number) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => new Date(now.getFullYear(), now.getMonth() + 1 + i, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", ""));
}

/** Gráfico de linhas (MRR por mês) em SVG, com legenda, rótulo direto no fim das linhas e tabela como alternativa. */
export function ProjectionChart({ series, months }: { series: ProjectionSeries[]; months: number }) {
  const W = 760, H = 280, L = 64, R = 96, T = 16, B = 34;
  const max = Math.max(1, ...series.flatMap((s) => s.mrrByMonth)) * 1.1;
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(1, months - 1);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const labels = monthLabels(months);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  return (
    <figure className="space-y-3">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Projeção do MRR (receita mensal recorrente) nos próximos meses, em três cenários" className="h-auto w-full">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{brl(Math.round(t))}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % 2 === 0 || months <= 6 ? <text key={l + i} x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--muted)">{l}</text> : null))}
        {series.map((s) => {
          const st = STYLE[s.key]!;
          const pts = s.mrrByMonth.map((v, i) => `${x(i)},${y(v)}`).join(" ");
          const last = s.mrrByMonth[months - 1] ?? 0;
          return (
            <g key={s.key}>
              <polyline points={pts} fill="none" stroke={st.stroke} strokeWidth="2.5" strokeDasharray={st.dash} strokeLinecap="round" strokeLinejoin="round" />
              <circle cx={x(months - 1)} cy={y(last)} r="4" fill={st.stroke} stroke="var(--surface)" strokeWidth="2" />
              <text x={x(months - 1) + 8} y={y(last) + 4} fontSize="11" fill="var(--fg)">{s.label}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap gap-4 text-xs text-muted">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <svg width="26" height="8" aria-hidden><line x1="0" x2="26" y1="4" y2="4" stroke={STYLE[s.key]!.stroke} strokeWidth="2.5" strokeDasharray={STYLE[s.key]!.dash} /></svg>
            {s.label}
          </span>
        ))}
      </figcaption>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted">Ver em tabela</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead><tr className="text-muted"><th className="py-1 pr-3 font-medium">Mês</th>{series.map((s) => <th key={s.key} className="py-1 pr-3 font-medium">{s.label}</th>)}</tr></thead>
            <tbody>
              {labels.map((l, i) => (
                <tr key={l + i} className="border-t border-border"><td className="py-1 pr-3">{l}</td>{series.map((s) => <td key={s.key} className="py-1 pr-3 tabular-nums">{brl(s.mrrByMonth[i])}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
