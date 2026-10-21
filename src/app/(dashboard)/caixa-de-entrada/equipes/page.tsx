import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { TeamsManager } from "@/modules/inbox/flow-controls";
import { can } from "@/server/context";
import { listTeams } from "@/server/services/inbox-flow.service";
import { listActiveMembers } from "@/server/services/members";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Equipes de trabalho" };

export default async function TeamsPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "inbox:read") || !can(ctx, "members:manage")) return <AccessDenied />;
  const [teams, members] = await Promise.all([listTeams(ctx), listActiveMembers(ctx)]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Equipes de trabalho" description="Grupos que recebem intimações na caixa de entrada. Só entram membros ativos com acesso à caixa." actions={<Link href="/caixa-de-entrada" className="text-sm underline">Voltar à caixa de entrada</Link>} />
      <Card>
        <CardBody>
          <TeamsManager teams={teams.map((t) => ({ id: t.id, name: t.name, members: t.members.map((m) => ({ id: m.id })) }))} members={members} />
        </CardBody>
      </Card>
    </div>
  );
}
