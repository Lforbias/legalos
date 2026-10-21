import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { isSubset } from "@/lib/permissions/check";
import { OWNER_ROLE_KEY } from "@/lib/permissions/roles";
import { TeamManager } from "@/modules/team/team-manager";
import { can } from "@/server/context";
import { listInvitations } from "@/server/services/invitation.service";
import { listMembers } from "@/server/services/membership.service";
import { listRoles } from "@/server/services/role.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Equipe" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ q?: string; convidar?: string }> }) {
  const { ctx, organization } = await requireTenant();
  if (!can(ctx, "members:read")) return <AccessDenied />;
  const sp = await searchParams;

  const [members, roles, invitations] = await Promise.all([
    listMembers(ctx),
    listRoles(ctx),
    can(ctx, "members:invite") ? listInvitations(ctx) : Promise.resolve([]),
  ]);
  const q = sp.q?.trim().toLowerCase();
  const filtered = q ? members.filter((m) => m.user.name.toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q)) : members;

  return (
    <TeamManager
      members={filtered.map((m) => ({
        id: m.id,
        status: m.status,
        createdAt: m.createdAt.toISOString(),
        user: m.user,
        role: m.role,
      }))}
      roles={roles.map((r) => ({
        id: r.id,
        key: r.key,
        name: r.name,
        // espelha a regra do servidor; a verificação real continua no servidor
        assignable: ctx.isOwner || (r.key !== OWNER_ROLE_KEY && isSubset(r.permissions, ctx.permissions)),
      }))}
      invitations={invitations.map((i) => ({
        id: i.id,
        email: i.email,
        createdAt: i.createdAt.toISOString(),
        expiresAt: i.expiresAt.toISOString(),
        expired: i.expired,
        roleName: i.role.name,
      }))}
      currentUserId={ctx.userId}
      canInvite={can(ctx, "members:invite")}
      canManage={can(ctx, "members:manage")}
      timezone={organization.timezone}
      openInvite={sp.convidar === "1" && can(ctx, "members:invite")}
    />
  );
}
