import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { CreateOrganizationForm } from "@/modules/organizations/create-organization-form";
import { WelcomeWizard } from "@/modules/welcome/welcome-wizard";
import { listUserOrganizations } from "@/server/services/organization.service";
import { getWelcomeProgress } from "@/server/services/welcome-onboarding.service";
import { getReservedGiftCode } from "@/server/services/gift-code.service";
import { billingConfig } from "@/server/services/billing.service";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Criar escritório" };

export default async function OnboardingPage() {
  const session = await requireSession();
  const orgs = await listUserOrganizations(session.user.id);
  if (orgs.length === 0) {
    const [progress, reservedGift] = await Promise.all([getWelcomeProgress(session.user.id), getReservedGiftCode(session.user.id)]);
    return <WelcomeWizard userName={session.user.name ?? ""} emailVerified={Boolean(session.user.emailVerifiedAt)} initialStep={progress.currentStep} initialData={progress.data} initialOffice={progress.office} initialGift={reservedGift} initialActivationPath={progress.activationPath} initialPlanKey={progress.planKey} checkoutSandboxReady={Boolean(billingConfig().config?.sandbox)} />;
  }
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-6"><Brand /></div>
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-surface/90 p-6 shadow-xl shadow-black/20 backdrop-blur">
      <div>
        <h1 className="text-lg font-semibold">{orgs.length ? "Novo escritório" : "Crie seu escritório"}</h1>
        <p className="mt-1 text-xs text-muted">
          Cada escritório é uma organização independente: clientes, processos, documentos e finanças nunca são compartilhados entre escritórios. Você será o
          Proprietário e terá 14 dias de avaliação gratuita, sem cobrança automática.
        </p>
      </div>
      <CreateOrganizationForm />
      {orgs.length ? (
        <Link href="/dashboard" className="block text-center text-xs text-primary-text hover:underline">
          Voltar
        </Link>
      ) : null}
      </div>
    </div>
  );
}
