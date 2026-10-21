import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { NAV_ITEMS } from "@/config/navigation";
import { can } from "@/server/context";
import { prototypesEnabled } from "@/modules/prototypes/registry";
import { ResendVerificationButton } from "@/modules/auth/components";
import { listNotifications, syncDueNotifications, unreadCount } from "@/server/services/notification.service";
import { listUserOrganizations } from "@/server/services/organization.service";
import { countNewNotices } from "@/server/services/box.service";
import { getEntitlements } from "@/server/services/plan.service";
import { requireTenant } from "@/server/session";
import { unreadTotal } from "@/server/services/whatsapp.service";

const PLAN_NOTICE: Partial<Record<string, (days: number | null) => string>> = {
  trial_ending: (d) => `Seu período de teste termina ${d === 0 ? "hoje" : d === 1 ? "amanhã" : `em ${d} dias`}. Fale com a administração para contratar um plano.`,
  trial_expired: () => "O período de teste terminou: você continua consultando e baixando tudo, mas novos envios, IA e convites estão pausados até contratar um plano.",
  canceled: () => "A assinatura está cancelada: consulta e download continuam; novos envios, IA e convites estão pausados.",
  past_due: () => "Há um pagamento em atraso. Regularize com a administração para evitar a pausa de novos envios.",
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, ctx } = await requireTenant();
  // cliente externo só usa o portal; o painel interno não é para ele
  if (ctx.roleKey === "CLIENT") redirect("/portal");
  const organizations = await listUserOrganizations(session.user.id);
  // avisos de vencimento são gerados sob demanda (no máximo 1x/min por usuário); falha aqui nunca derruba a página
  await syncDueNotifications(ctx).catch(() => 0);
  const [unread, latest] = await Promise.all([unreadCount(ctx), listNotifications(ctx, { take: 8 })]);
  const boxBadge = can(ctx, "inbox:read") ? await countNewNotices(ctx).catch(() => 0) : 0;
  const chatBadge = can(ctx, "whatsapp:read") ? await unreadTotal(ctx).catch(() => 0) : 0;
  const ent = await getEntitlements(ctx.organizationId).catch(() => null);
  const planNotice = ent ? PLAN_NOTICE[ent.state]?.(ent.trialDaysLeft) ?? null : null;
  const visibleKeys = NAV_ITEMS.filter((n) => (n.key !== "prototypes" || prototypesEnabled()) && (!n.permission || can(ctx, n.permission))).map((n) => n.key);

  return (
    <AppShell
      user={{ name: session.user.name, email: session.user.email }}
      organizations={organizations.map((o) => ({ id: o.id, name: o.name, roleName: o.roleName }))}
      activeOrganizationId={ctx.organizationId}
      visibleKeys={visibleKeys}
      boxBadge={boxBadge}
      chatBadge={chatBadge}
      canInvite={can(ctx, "members:invite")}
      canCreateClient={can(ctx, "clients:write")}
      canCreateCase={can(ctx, "cases:write")}
      canCreateTask={can(ctx, "tasks:write")}
      notifications={{ unread, items: latest.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, read: n.readAt !== null })) }}
      banner={
        planNotice ? (
          <div className="flex flex-wrap items-center justify-center gap-2 border-b border-warning/30 bg-warning-bg px-4 py-1.5 text-xs text-warning" data-testid="plan-banner">
            {planNotice} <Link href="/configuracoes" className="underline">Ver plano e uso</Link>
          </div>
        ) : session.user.emailVerifiedAt ? null : (
          <div className="flex flex-wrap items-center justify-center gap-2 border-b border-warning/30 bg-warning-bg px-4 py-1.5 text-xs text-warning">
            Seu e-mail ainda não foi confirmado. <ResendVerificationButton />
          </div>
        )
      }
    >
      {children}
    </AppShell>
  );
}
