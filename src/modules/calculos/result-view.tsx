import type { CalcResult } from "@/lib/calc/num";
import { Alert } from "@/components/ui/alert";

export function CalcResultView({ result }: { result: CalcResult }) {
  return (
    <div className="space-y-5">
      {result.warnings.length > 0 ? (
        <Alert tone="warning">
          <ul className="list-disc space-y-1 pl-4">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </Alert>
      ) : null}
      <dl className="grid gap-x-6 gap-y-1 rounded-lg border border-border bg-surface p-4 text-sm sm:grid-cols-2">
        {result.summary.map(([k, v]) => (
          <div key={k} className={`flex justify-between gap-3 ${/^TOTAL|VENCIMENTO/.test(k) ? "font-semibold sm:col-span-2" : ""}`}>
            <dt className="text-muted">{k}</dt>
            <dd className="text-right">{v}</dd>
          </div>
        ))}
      </dl>
      {result.sections.map((s) => (
        <section key={s.title}>
          <h3 className="mb-2 text-sm font-semibold">{s.title}</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-max text-left text-xs">
              <thead className="bg-surface-2 text-muted"><tr>{s.columns.map((c) => <th key={c} className="px-3 py-2 font-medium">{c}</th>)}</tr></thead>
              <tbody>{s.rows.map((r, i) => <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className="whitespace-nowrap px-3 py-1.5">{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </section>
      ))}
      <details className="text-xs text-muted">
        <summary className="cursor-pointer font-medium">Critérios aplicados</summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">{result.criteria.map((c) => <li key={c}>{c}</li>)}</ul>
      </details>
    </div>
  );
}
