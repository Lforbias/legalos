import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { RolesManager } from "@/modules/team/roles-manager";
import { can } from "@/server/context";
import { listRoles } from "@/server/services/role.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Perfis de acesso" };

export default async function RolesPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "members:read")) return <AccessDenied />;
  const roles = await listRoles(ctx);
  return <RolesManager roles={roles} actorPermissions={[...ctx.permissions]} actorIsOwner={ctx.isOwner} canManage={can(ctx, "roles:manage")} />;
}
