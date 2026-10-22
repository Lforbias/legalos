import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { RolesManager } from "@/modules/team/roles-manager";
import { can } from "@/server/context";
import { AccessTools } from "@/modules/vault/vault-panel";
import { accessReview, listRoles, listRoleTemplates } from "@/server/services/role.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Perfis de acesso" };

export default async function RolesPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "members:read")) return <AccessDenied />;
  const roles = await listRoles(ctx);
  const manage = can(ctx, "roles:manage");
  const review = manage ? (await accessReview(ctx)).rows : null;
  return (
    <>
      <RolesManager roles={roles} actorPermissions={[...ctx.permissions]} actorIsOwner={ctx.isOwner} canManage={manage} />
      <AccessTools templates={listRoleTemplates(ctx).map((t) => ({ key: t.key, name: t.name, description: t.description }))} review={review} existing={roles.map((r) => r.name)} canManage={manage} />
    </>
  );
}
