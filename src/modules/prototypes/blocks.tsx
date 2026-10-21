import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/form";
import type { Block, Field } from "./types";

const btn = "inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-xs font-medium hover:bg-surface-2";
const btnPrimary = "inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-white";

function Actions({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((a, i) => <button key={a} type="button" className={i === 0 ? btnPrimary : btn} title="Protótipo: sem função">{a}</button>)}
    </div>
  );
}

function FieldView({ f, id }: { f: Field; id: string }) {
  if (f.kind === "toggle") {
    return (
      <label className="flex items-center gap-2 text-sm md:col-span-2">
        <input type="checkbox" defaultChecked={f.on} className="h-4 w-4" /> {f.label}
        {f.hint ? <span className="text-xs text-muted">— {f.hint}</span> : null}
      </label>
    );
  }
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted">{f.label}</label>
      {f.kind === "select" ? (
        <Select id={id} defaultValue={f.value ?? f.options?.[0]}>{(f.options ?? []).map((o) => <option key={o}>{o}</option>)}</Select>
      ) : f.kind === "textarea" ? (
        <Textarea id={id} rows={3} defaultValue={f.value} />
      ) : (
        <Input id={id} type={f.kind === "password" ? "password" : f.kind === "date" ? "date" : "text"} defaultValue={f.value} />
      )}
      {f.hint ? <p className="mt-1 text-xs text-muted">{f.hint}</p> : null}
    </div>
  );
}

const toneOf = (v: string) => (/^(Conectado|Ativo|Ligado|Enviado|Protocolado|Concluíd|Aceito|Ok|Sim)/i.test(v) ? "success" : /^(Falha|Desconectado|Erro|Cancelad|Vencid|Atrasad|Recusad)/i.test(v) ? "danger" : /^(Agendad|Pendente|Aguardando|Em |Rascunho|Revisar|Sugerid)/i.test(v) ? "warning" : null);

export function BlockView({ b, idx }: { b: Block; idx: number }) {
  switch (b.t) {
    case "stats":
      return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {b.items.map((s) => (
            <Card key={s.label}><CardBody><p className="text-xs text-muted">{s.label}</p><p className="mt-1 text-2xl font-semibold">{s.value}</p>{s.hint ? <p className="mt-0.5 text-xs text-muted">{s.hint}</p> : null}</CardBody></Card>
          ))}
        </div>
      );
    case "table":
      return (
        <Card className="overflow-x-auto">
          <CardHeader title={b.title} description={b.description} action={<Actions items={b.actions} />} />
          {b.filters?.length ? (
            <div className="flex flex-wrap gap-2 border-b border-border px-4 py-2">
              {b.filters.map((f) => <span key={f} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">{f}</span>)}
            </div>
          ) : null}
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted">{b.cols.map((c) => <th key={c} scope="col" className="px-4 py-2 font-medium">{c}</th>)}</tr></thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {r.map((c, j) => {
                    const tone = toneOf(c);
                    return <td key={j} className="px-4 py-2.5">{tone && j > 0 ? <Badge tone={tone}>{c}</Badge> : c}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      );
    case "kanban":
      return (
        <div>
          <h2 className="text-sm font-semibold">{b.title}</h2>
          {b.description ? <p className="mb-2 text-xs text-muted">{b.description}</p> : null}
          <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {b.cols.map((c) => (
              <section key={c.name} aria-label={c.name} className="rounded-lg border border-border bg-surface-2/40 p-2">
                <h3 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold">{c.name}<span className="rounded-full bg-surface-3 px-1.5 text-[11px] text-muted">{c.cards.length}</span></h3>
                <div className="space-y-2">
                  {c.cards.map((k) => (
                    <article key={k.title} className="rounded-md border border-border bg-surface p-2.5">
                      <p className="text-sm font-medium">{k.title}</p>
                      {k.meta ? <p className="mt-0.5 text-xs text-muted">{k.meta}</p> : null}
                      {k.tag ? <div className="mt-1"><Badge tone="info">{k.tag}</Badge></div> : null}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      );
    case "form":
      return (
        <Card>
          <CardHeader title={b.title} description={b.description} />
          <CardBody className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">{b.fields.map((f, i) => <FieldView key={f.label} f={f} id={`p${idx}-${i}`} />)}</div>
            <Actions items={b.actions} />
          </CardBody>
        </Card>
      );
    case "toggles":
      return (
        <Card>
          <CardHeader title={b.title} description={b.description} />
          <CardBody className="space-y-2.5">
            {b.items.map((t) => (
              <label key={t.label} className="flex items-start gap-2 text-sm">
                <input type="checkbox" defaultChecked={t.on} className="mt-0.5 h-4 w-4" />
                <span>{t.label}{t.hint ? <span className="block text-xs text-muted">{t.hint}</span> : null}</span>
              </label>
            ))}
          </CardBody>
        </Card>
      );
    case "steps":
      return (
        <Card>
          <CardHeader title={b.title} />
          <CardBody>
            <ol className="space-y-3">
              {b.steps.map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold">{i + 1}</span>
                  <span className="text-sm"><span className="font-medium">{s.title}</span><span className="block text-xs text-muted">{s.text}</span></span>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      );
    case "note":
      return <p className="rounded-md border border-border bg-surface-2/60 p-3 text-sm text-muted">{b.text}</p>;
  }
}
