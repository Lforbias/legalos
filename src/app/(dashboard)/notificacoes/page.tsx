import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates/format";
import { MarkAllReadButton } from "@/modules/notifications/mark-all-read";
import { listNotifications, syncDueNotifications } from "@/server/services/notification.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Notificações" };

export default async function NotificationsPage() {
  const { ctx, organization } = await requireTenant();
  await syncDueNotifications(ctx, new Date(), true).catch(() => 0);
  const items = await listNotifications(ctx, { take: 100 });
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Notificações" description="Avisos de prazos, tarefas e atribuições para você neste escritório." actions={unread > 0 ? <MarkAllReadButton /> : null} />
      {items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">Nenhuma notificação por enquanto.</Card>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {items.map((n) => (
            <li key={n.id} className="flex flex-wrap items-start gap-2 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className={n.readAt ? "text-muted" : "font-medium"}>
                  {n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title}
                </p>
                {n.body ? <p className="mt-0.5 text-xs text-muted">{n.body}</p> : null}
                <p className="mt-0.5 text-[11px] text-muted">{formatDateTime(n.createdAt, organization.timezone)}</p>
              </div>
              {!n.readAt ? <Badge tone="info">Nova</Badge> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
