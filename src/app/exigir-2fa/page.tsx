import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/layout/brand";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db/client";
import { GateMfa } from "@/modules/account/gate-mfa";
import { logoutAction } from "@/modules/auth/actions";
import { mfaStatus } from "@/server/services/mfa.service";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Ative a verificação em duas etapas" };
export const dynamic = "force-dynamic";

/** Tela única para quem entrou num escritório que exige 2FA e ainda não ativou. Depois de ativar, volta ao sistema. */
export default async function RequireMfaPage() {
  const session = await requireSession();
  const orgs = await db.membership.findMany({ where: { userId: session.user.id, status: "ACTIVE", role: { key: { not: "CLIENT" } }, organization: { deletedAt: null, requireMfa: true } }, select: { organization: { select: { name: true } } } });
  const st = await mfaStatus(session.user.id);
  if (orgs.length === 0) redirect("/dashboard");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 py-10" data-testid="require-mfa-page">
      <div className="flex justify-center"><Brand /></div>
      <Card>
        <CardHeader title="Ative a verificação em duas etapas" description={`${orgs.length === 1 ? `O escritório ${orgs[0]!.organization.name} exige` : "Seus escritórios exigem"} este passo extra de segurança para entrar.`} />
        <CardBody className="space-y-4">
          <Alert tone="info">Você precisa de um aplicativo autenticador no celular (Google Authenticator, Authy, 1Password…). Leva um minuto e protege os dados dos clientes mesmo que a senha vaze.</Alert>
          <GateMfa available={st.available} initiallyEnabled={st.enabled} recoveryLeft={st.recoveryCodesLeft} />
        </CardBody>
      </Card>
      <form action={logoutAction} className="text-center"><button type="submit" className="text-sm text-muted underline">Sair</button></form>
    </main>
  );
}
