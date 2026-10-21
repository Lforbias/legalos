import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PasswordForm, ProfileForm, SessionsList } from "@/modules/account/account-forms";
import { PushCard } from "@/modules/push/push-card";
import { MfaCard } from "@/modules/account/mfa-card";
import { listSessions } from "@/server/services/auth.service";
import { mfaStatus } from "@/server/services/mfa.service";
import { getPushView } from "@/server/services/push.service";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Minha conta" };

export default async function AccountPage() {
  const { session, organization, ctx } = await requireTenant();
  const [sessions, mfa, push] = await Promise.all([listSessions(session.user.id), mfaStatus(session.user.id), getPushView(ctx)]);
  const locale = session.user.locale === "en-US" ? "en-US" : "pt-BR";
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Minha conta" description={session.user.email} actions={session.user.emailVerifiedAt ? <Badge tone="success">E-mail confirmado</Badge> : <Badge tone="warning">E-mail não confirmado</Badge>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Perfil e preferências" />
          <CardBody>
            <ProfileForm initial={{ name: session.user.name, locale, timezone: session.user.timezone }} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Alterar senha" />
          <CardBody>
            <PasswordForm />
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Verificação em duas etapas" action={mfa.enabled ? <Badge tone="success">Ativa</Badge> : <Badge tone="warning">Desativada</Badge>} />
          <CardBody>
            <MfaCard available={mfa.available} enabled={mfa.enabled} recoveryLeft={mfa.recoveryCodesLeft} />
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Avisos no celular" description="Prazos e tarefas perto de vencer, direto na tela do aparelho." />
          <CardBody>
            <PushCard
              view={{
                configured: push.configured,
                publicKey: push.publicKey,
                orgEnabled: push.orgEnabled,
                canManageOrg: can(ctx, "organization:manage"),
                prefs: push.prefs,
                devices: push.devices.map((d) => ({ id: d.id, endpoint: d.endpoint, userAgent: d.userAgent, createdAt: d.createdAt.toISOString(), lastSentAt: d.lastSentAt?.toISOString() ?? null })),
              }}
            />
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Sessões ativas" description="Encerre sessões em dispositivos que você não reconhece." />
          <CardBody>
            <SessionsList
              timezone={organization.timezone}
              sessions={sessions.map((s) => ({
                id: s.id,
                userAgent: s.userAgent,
                ipAddress: s.ipAddress,
                createdAt: s.createdAt.toISOString(),
                lastSeenAt: s.lastSeenAt.toISOString(),
                current: s.id === session.id,
              }))}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
