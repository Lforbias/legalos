import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates/format";
import { noticeStates, type NoticeStateInput, type StateChip, type StateKey } from "@/lib/judicial/notice-state";
import type { TimelineEntry } from "@/server/judicial/inbox-v2.service";

/** Etiquetas compactas para a lista: só os estados que mudam a decisão de quem trabalha a caixa. */
export function NoticeStateChips({ n, keys = ["viewed", "official"] }: { n: NoticeStateInput; keys?: StateKey[] }) {
  const chips = noticeStates(n).filter((c) => keys.includes(c.key));
  return (
    <span className="flex flex-wrap gap-1" data-testid="notice-state-chips">
      {chips.map((c) => (
        <Badge key={c.key} tone={c.tone} title={c.detail} data-state-key={c.key}>{c.label}</Badge>
      ))}
    </span>
  );
}

/** Os estados da comunicação separados, cada um com a explicação em português simples. */
export function NoticeStatesCard({ n, capturedAt, firstViewedAt, firstViewedByName, officialAckAt, tz }: { n: NoticeStateInput; capturedAt: Date | null; firstViewedAt: Date | null; firstViewedByName: string | null; officialAckAt: Date | null; tz: string }) {
  const extra: Partial<Record<StateKey, string>> = {
    capture: capturedAt ? `Em ${formatDateTime(capturedAt, tz)}.` : undefined,
    viewed: firstViewedAt ? `Primeira vez em ${formatDateTime(firstViewedAt, tz)}${firstViewedByName ? `, por ${firstViewedByName}` : ""}.` : undefined,
    official: officialAckAt ? `Registrada em ${formatDateTime(officialAckAt, tz)}.` : undefined,
  };
  const chips: StateChip[] = noticeStates(n);
  return (
    <Card>
      <CardHeader title="Situação da comunicação" description="Cada etapa é independente: abrir aqui não equivale a ciência no tribunal." />
      <CardBody>
        <ul className="space-y-3" data-testid="notice-states">
          {chips.map((c) => (
            <li key={c.key} data-state-key={c.key} className="text-sm">
              <Badge tone={c.tone}>{c.label}</Badge>
              <p className="mt-1 text-xs text-muted">{c.detail}{extra[c.key] ? ` ${extra[c.key]}` : ""}</p>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

export function NoticeTimelineCard({ entries, tz }: { entries: TimelineEntry[]; tz: string }) {
  return (
    <Card>
      <CardHeader title="Histórico" description="Tudo o que aconteceu com esta comunicação, em ordem." />
      <CardBody>
        {entries.length === 0 ? (
          <p className="text-sm text-muted">Sem eventos registrados (comunicação anterior ao histórico do Box 2.0).</p>
        ) : (
          <ol className="space-y-3" data-testid="notice-timeline">
            {entries.map((e) => (
              <li key={e.id} data-event-kind={e.kind} className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 text-sm">
                <time dateTime={e.at.toISOString()} className="text-xs tabular-nums text-muted">{formatDateTime(e.at, tz)}</time>
                <div className="min-w-0">
                  <p className="break-words font-medium">{e.title}</p>
                  {e.detail ? <p className="break-words text-xs text-muted">{e.detail}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
