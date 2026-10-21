import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { ClientForm, EMPTY_CLIENT } from "@/modules/clients/client-form";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Novo cliente" };

export default async function NewClientPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "clients:write")) return <AccessDenied />;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Novo cliente" description="CPF e CNPJ são validados pelos dígitos verificadores e não podem se repetir no escritório." />
      <ClientForm initial={EMPTY_CLIENT} />
    </div>
  );
}
