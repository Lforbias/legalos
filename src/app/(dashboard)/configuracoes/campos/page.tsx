import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { CustomFieldsAdmin } from "@/modules/cases/extras-ui";
import { can } from "@/server/context";
import { listCustomFields } from "@/server/services/custom-field.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Campos personalizados" };

export default async function CustomFieldsPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "cases:read")) return <AccessDenied />;
  const rows = await listCustomFields(ctx, { includeInactive: true });
  return <CustomFieldsAdmin canEdit={can(ctx, "organization:manage")} rows={rows.map((r) => ({ id: r.id, label: r.label, type: r.type, options: r.options, active: r.active }))} />;
}
