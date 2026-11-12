import { redirect } from "next/navigation";
import { EvolutionShell } from "@/components/evolution/evolution-shell";
import { EVOLUTION_NAV, expandVisibleKeys } from "@/config/evolution-navigation";
import { evolutionEnabled } from "@/lib/evolution";
import { can } from "@/server/context";
import { listNotifications, syncDueNotifications, unreadCount } from "@/server/services/notification.service";
import { listUserOrganizations } from "@/server/services/organization.service";
import { requireTenant } from "@/server/session";

export default async function EvolutionLayout({ children }: { children: React.ReactNode }) {
  if (!evolutionEnabled()) redirect("/dashboard");

  const { session, ctx } = await requireTenant();
  if (ctx.roleKey === "CLIENT") redirect("/portal");

  const organizations = await listUserOrganizations(session.user.id);
  await syncDueNotifications(ctx).catch(() => 0);
  const [unread, latest] = await Promise.all([unreadCount(ctx), listNotifications(ctx, { take: 8 })]);

  const evoKeys = EVOLUTION_NAV.filter((n) => {
    if (!n.permission && !n.permissionAny) return true;
    if (n.permissionAny) return n.permissionAny.some((p) => ctx.permissions.has(p));
    return n.permission ? can(ctx, n.permission) : true;
  }).map((n) => n.key);
  const visibleKeys = expandVisibleKeys(evoKeys);

  return (
    <EvolutionShell
      user={{ name: session.user.name, email: session.user.email }}
      organizations={organizations.map((o) => ({ id: o.id, name: o.name, roleName: o.roleName }))}
      activeOrganizationId={ctx.organizationId}
      visibleKeys={visibleKeys}
      canInvite={can(ctx, "members:invite")}
      canCreateClient={can(ctx, "clients:write")}
      canCreateCase={can(ctx, "cases:write")}
      canCreateTask={can(ctx, "tasks:write")}
      notifications={{ unread, items: latest.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, read: n.readAt !== null })) }}
    >
      {children}
    </EvolutionShell>
  );
}
