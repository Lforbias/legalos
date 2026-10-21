import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { NotFoundError } from "@/lib/permissions/check";
import { uuidSchema } from "@/lib/validation/common";
import { formatDocument } from "@/lib/validation/br-documents";
import { ClientForm } from "@/modules/clients/client-form";
import { can } from "@/server/context";
import { getClient } from "@/server/services/client.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Editar cliente" };

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "clients:write")) return <AccessDenied />;
  const parsed = uuidSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const c = await getClient(ctx, parsed.data).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!c) notFound();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={`Editar: ${c.name}`} />
      <ClientForm
        clientId={c.id}
        initial={{
          type: c.type,
          status: c.status,
          name: c.name,
          tradeName: c.tradeName ?? "",
          document: formatDocument(c.type, c.document),
          email: c.email ?? "",
          phone: c.phone ?? "",
          birthDate: c.birthDate ? c.birthDate.toISOString().slice(0, 10) : "",
          tags: c.tags.join(", "),
          notes: c.notes ?? "",
          addressZip: c.addressZip ?? "",
          addressStreet: c.addressStreet ?? "",
          addressNumber: c.addressNumber ?? "",
          addressComplement: c.addressComplement ?? "",
          addressDistrict: c.addressDistrict ?? "",
          addressCity: c.addressCity ?? "",
          addressState: c.addressState ?? "",
        }}
      />
    </div>
  );
}
