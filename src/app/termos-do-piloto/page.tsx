import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/layout/brand";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { PILOT_TERMS, PILOT_TERMS_VERSION, pilotTermsRequired } from "@/lib/pilot-terms";
import { logoutAction } from "@/modules/auth/actions";
import { acceptPilotTerms, needsPilotTerms } from "@/server/services/pilot-terms.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Termos do piloto" };
export const dynamic = "force-dynamic";

async function acceptAction() {
  "use server";
  const { ctx } = await requireTenant();
  await acceptPilotTerms(ctx);
  redirect("/dashboard");
}

/** Termos de uso e privacidade do piloto: aceite registrado antes de usar o painel (quando LEGALOS_PILOT_TERMS=1). */
export default async function PilotTermsPage() {
  const { ctx } = await requireTenant();
  const pending = await needsPilotTerms(ctx.userId);
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-4 py-10" data-testid="pilot-terms-page">
      <div className="flex justify-center"><Brand /></div>
      <Card>
        <CardHeader title="Termos de uso e privacidade do piloto" description={`Versão ${PILOT_TERMS_VERSION}. Leia antes de começar a usar.`} />
        <CardBody className="space-y-4 text-sm">
          {PILOT_TERMS.map((s) => (
            <section key={s.title} className="space-y-1">
              <h2 className="font-semibold">{s.title}</h2>
              <p className="text-muted">{s.body}</p>
            </section>
          ))}
          {pending ? (
            <form action={acceptAction} className="pt-2">
              <button type="submit" className={buttonVariants({})}>Li e aceito os termos do piloto</button>
            </form>
          ) : (
            <p className="pt-2 text-muted">{pilotTermsRequired() ? "Você já aceitou esta versão." : "O aceite não é exigido neste ambiente."}</p>
          )}
        </CardBody>
      </Card>
      <form action={logoutAction} className="text-center"><button type="submit" className="text-sm text-muted underline">Sair</button></form>
    </main>
  );
}
