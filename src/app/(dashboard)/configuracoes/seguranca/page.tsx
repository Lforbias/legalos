import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SecurityPanel } from "@/modules/whatsapp/tools-ui";
import { can } from "@/server/context";
import { getSecuritySettings, listOrgSessions, modulesOf } from "@/server/services/org-security.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Segurança da conta" };
export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "organization:manage")) return <AccessDenied />;
  const [s, sessions, mods] = await Promise.all([getSecuritySettings(ctx), listOrgSessions(ctx), modulesOf(ctx.organizationId)]);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Segurança da conta" description="Endereços permitidos, saída por inatividade e sessões da equipe." />
        <CardBody>
          <SecurityPanel s={s} sessions={sessions.map((x) => ({ id: x.id, userName: x.user.name, ipAddress: x.ipAddress, userAgent: x.userAgent, lastSeenAt: x.lastSeenAt.toISOString() }))} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Módulos do plano" description="O que o plano contratado libera. Para mudar, fale com a administração da plataforma." />
        <CardBody>
          <ul className="space-y-1 text-sm">{mods.map((m) => <li key={m.key} className="flex items-center justify-between gap-2"><span>{m.label}</span><Badge tone={m.enabled ? "success" : "neutral"}>{m.enabled ? "Incluído" : "Não incluído"}</Badge></li>)}</ul>
        </CardBody>
      </Card>
    </div>
  );
}
