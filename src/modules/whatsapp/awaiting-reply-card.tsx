import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatWait } from "@/lib/whatsapp/wait-time";
import { formatDateTime } from "@/lib/dates/format";
import { can, type TenantContext } from "@/server/context";
import { listConversationsAwaitingReply } from "@/server/services/whatsapp.service";
import { AutoRefresh } from "./auto-refresh";

export async function AwaitingReplyCard({ ctx }: { ctx: TenantContext }) {
  if (!can(ctx, "whatsapp:read")) return null;
  const rows = await listConversationsAwaitingReply(ctx);

  return (
    <Card>
      <AutoRefresh everyMs={30_000} />
      <CardHeader title="Clientes aguardando resposta" description="Conversas abertas com a espera mais longa." action={<Link href="/atendimento?f=waiting" className="text-sm text-primary-text hover:underline">Ver fila</Link>} />
      {rows.length ? (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={`/atendimento?f=waiting&c=${row.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <p className="text-xs text-muted">{row.assignee ?? "Sem responsável"}</p>
                </div>
                <time className="shrink-0 text-right text-sm tabular-nums" dateTime={row.waitingSince.toISOString()} title={formatDateTime(row.waitingSince, ctx.timezone)}>
                  {formatWait(row.waitingMinutes)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      ) : <CardBody><p className="text-sm text-muted">Nenhuma conversa aguardando resposta.</p></CardBody>}
    </Card>
  );
}
