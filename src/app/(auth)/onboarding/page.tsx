import type { Metadata } from "next";
import Link from "next/link";
import { CreateOrganizationForm } from "@/modules/organizations/create-organization-form";
import { listUserOrganizations } from "@/server/services/organization.service";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Criar escritório" };

export default async function OnboardingPage() {
  const session = await requireSession();
  const orgs = await listUserOrganizations(session.user.id);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">{orgs.length ? "Novo escritório" : "Crie seu escritório"}</h1>
        <p className="mt-1 text-xs text-muted">
          Cada escritório é uma organização independente: clientes, processos, documentos e finanças nunca são compartilhados entre escritórios. Você será o
          Proprietário e terá 14 dias de teste do plano Profissional (sem cobrança).
        </p>
      </div>
      <CreateOrganizationForm />
      {orgs.length ? (
        <Link href="/" className="block text-center text-xs text-primary-text hover:underline">
          Voltar
        </Link>
      ) : null}
    </div>
  );
}
