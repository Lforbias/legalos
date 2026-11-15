import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/layout/page-header";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "RUTE desativada" };
export default async function RutePage() {
  await requireTenant();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="RUTE desativada" description="Os recursos da RUTE estão temporariamente indisponíveis." />
      <Alert tone="info">Assistente, propostas, conexões e atalhos da RUTE estão desativados.</Alert>
      <Link className="text-sm font-medium text-primary underline" href="/evolution/administracao">Voltar à Administração &amp; Gestão</Link>
    </div>
  );
}
