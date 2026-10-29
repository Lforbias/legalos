import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db/client";
import { boxV2Enabled } from "@/lib/features";
import { UFS } from "@/lib/mni/tribunals";
import { listConnectionCards } from "@/server/judicial/connections.service";
import { getSetupState } from "@/server/judicial/overview.service";
import { listProfessionals } from "@/server/judicial/professional.service";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";
import { OnboardingWizard, type WizardProfessional, type WizardSource } from "@/modules/box/onboarding-wizard";

export const metadata: Metadata = { title: "Configurar o Box" };

export default async function ConfigureBoxPage({ searchParams }: { searchParams: Promise<{ passo?: string }> }) {
  const { ctx } = await requireTenant();
  if (!boxV2Enabled(ctx.organizationId)) notFound();
  if (!can(ctx, "integrations:manage")) return <AccessDenied />;
  const sp = await searchParams;
  const [professionals, monitors, cards, setup] = await Promise.all([
    listProfessionals(ctx),
    db.djenMonitor.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, professionalId: true, oabNumber: true, oabUf: true, enabled: true, firstVerifiedAt: true } }),
    listConnectionCards(ctx),
    getSetupState(ctx.organizationId),
  ]);

  const wizardProfessionals: WizardProfessional[] = professionals
    .filter((p) => p.active)
    .map((p) => {
      const m = monitors.find((x) => x.professionalId === p.id || (x.oabNumber === p.oabNumber && x.oabUf === p.oabUf));
      return { id: p.id, name: p.name, oab: `${p.oabUf} ${p.oabNumber}`, notifyEmail: p.notifyEmail, monitor: m ? { id: m.id, enabled: m.enabled, verified: m.firstVerifiedAt !== null } : null };
    });
  const sources: WizardSource[] = cards.map((c) => ({ kind: c.kind as WizardSource["kind"], id: c.id, title: c.title, subtitle: c.subtitle, enabled: c.enabled, state: c.state, stateLabel: c.stateLabel, headline: c.headline, nextAction: c.nextAction }));

  const wanted = Number(sp.passo);
  const initialStep = Number.isInteger(wanted) && wanted >= 1 && wanted <= 5 ? wanted : setup.step === "PROFESSIONAL" ? 1 : setup.step === "DONE" ? 4 : 2;
  // sugere a seccional do último advogado cadastrado (escritórios costumam ter a mesma UF)
  const defaultUf = professionals.at(-1)?.oabUf ?? "BA";

  return (
    <div className="mx-auto max-w-4xl" data-testid="box-onboarding">
      <PageHeader title="Configurar o Box" description="Em poucos passos o LegalOS passa a acompanhar as publicações da sua OAB e mostra, com consulta real, o que está funcionando e o que ainda falta." />
      <OnboardingWizard ufs={UFS} defaultUf={defaultUf} professionals={wizardProfessionals} sources={sources} initialStep={initialStep} canCheck={can(ctx, "inbox:write")} />
    </div>
  );
}
