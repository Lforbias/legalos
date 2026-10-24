import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { OrganizationForm } from "@/modules/organizations/organization-form";
import { can } from "@/server/context";
import { getOrganization } from "@/server/services/organization.service";
import { requireTenant } from "@/server/session";
export const metadata: Metadata = { title: "Dados do escritório" };
export default async function OfficeSettingsPage() {
  const { ctx } = await requireTenant(); const org = await getOrganization(ctx);
  return <Card className="max-w-3xl"><CardHeader title="Dados do escritório" description="Identificação e fuso horário usados pela equipe." /><CardBody><OrganizationForm canEdit={can(ctx, "organization:manage")} initial={{ name: org.name, legalName: org.legalName ?? "", document: org.document ?? "", timezone: org.timezone }} /></CardBody></Card>;
}
