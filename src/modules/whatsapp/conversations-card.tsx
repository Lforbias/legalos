import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { relativeTime } from "@/lib/dates/format";
import { formatWaId } from "@/lib/whatsapp/phone";

export type ConversationRow = { id: string; waId: string; contactName: string | null; status: string; lastMessageAt: Date | null; lastPreview: string | null; unreadCount: number; assignedTo: { name: string } | null };

/** Conversas de WhatsApp (LegalOS Chat) mostradas na ficha de cliente, processo ou lead. Só renderiza se houver conversa. */
export function ConversationsCard({ rows }: { rows: ConversationRow[] }) {
  if (rows.length === 0) return null;
  return (
    <Card data-testid="chat-conversations">
      <CardHeader title="Conversas de WhatsApp" description="LegalOS Chat" />
      <CardBody className="space-y-2">
        {rows.map((r) => (
          <Link key={r.id} href={`/atendimento?f=${r.status === "OPEN" ? "open" : "closed"}&c=${r.id}`} className="block rounded-md border border-border p-2 text-sm hover:bg-surface-2">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{r.contactName ?? formatWaId(r.waId)}</span>
              {r.unreadCount > 0 ? <Badge tone="info">{r.unreadCount}</Badge> : r.status !== "OPEN" ? <Badge>Encerrada</Badge> : null}
            </div>
            <div className="truncate text-xs text-muted">{r.lastPreview ?? "—"}</div>
            <div className="mt-0.5 flex justify-between text-[11px] text-muted">
              <span>{r.assignedTo?.name ?? "Sem responsável"}</span>
              <span>{r.lastMessageAt ? relativeTime(r.lastMessageAt) : ""}</span>
            </div>
          </Link>
        ))}
      </CardBody>
    </Card>
  );
}
