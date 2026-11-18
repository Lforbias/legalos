import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { RecordBackLink } from "@/components/layout/record-back-link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db/client";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";
import { coworkAvailability, getCoworkSettings, listMembersForAdmin } from "@/server/services/cowork-access.service";
import { MemberRow, MyProfileForm, WorkspaceSettingsForm } from "@/modules/cowork/settings-ui";

export const metadata: Metadata = { title: "Configurações — Cowork" };
export const dynamic = "force-dynamic";

export default async function CoworkSettingsPage() {
  const { ctx } = await requireTenant();
  if (!(await coworkAvailability(ctx)).ok) return <AccessDenied />;
  const manage = can(ctx, "cowork:manage");
  const [profile, settings, members] = await Promise.all([
    db.coworkMemberProfile.findUnique({ where: { organizationId_userId: { organizationId: ctx.organizationId, userId: ctx.userId } } }),
    getCoworkSettings(ctx.organizationId),
    manage ? listMembersForAdmin(ctx) : Promise.resolve([]),
  ]);
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <RecordBackLink href="/cowork">Cowork</RecordBackLink>
        <PageHeader title={manage ? "Configurações do Cowork" : "Meu perfil no Cowork"} description="O Cowork usa a mesma conta do LegalOS: aqui você ajusta só como aparece para a equipe." />
      </div>
      <Card>
        <CardHeader title="Meu perfil" description="Nome profissional, cargo e disponibilidade declarada. O estado de trabalho é calculado a partir de tarefas, agenda e reuniões." />
        <CardBody><MyProfileForm initial={{ displayName: profile?.displayName ?? "", jobTitle: profile?.jobTitle ?? "", availability: profile?.availability ?? "", availabilityNote: profile?.availabilityNote ?? "" }} /></CardBody>
      </Card>
      {manage ? (
        <>
          <Card>
            <CardHeader title="Escritório" description="Habilitação e canais padrão." />
            <CardBody><WorkspaceSettingsForm initial={{ enabled: settings.enabled, allowDirect: settings.allowDirect, defaultChannels: settings.defaultChannels }} /></CardBody>
          </Card>
          <Card>
            <CardHeader title="Pessoas" description="Departamento, cargo e bloqueio individual do Cowork. O acesso por função é definido nos perfis (permissões “Cowork”)." action={<Link href="/configuracoes/perfis" className="text-xs underline">Perfis e permissões</Link>} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-muted"><tr className="border-b border-border"><th className="px-4 py-2 font-medium">Pessoa</th><th className="px-3 py-2 font-medium">Perfil</th><th className="px-3 py-2 font-medium">Departamento</th><th className="px-3 py-2 font-medium">Cargo</th><th className="px-3 py-2 font-medium">Acesso</th></tr></thead>
                <tbody>{members.map((m) => <MemberRow key={m.id} m={m} />)}</tbody>
              </table>
            </div>
          </Card>
          <Card>
            <CardHeader title="Agentes de IA" description="Preparado na arquitetura, ainda não disponível." />
            <CardBody className="text-sm text-muted">Nenhum agente de IA participa do Cowork. A estrutura já separa autores humanos de agentes e registra tudo em auditoria; os agentes departamentais (Comercial, Atendimento, Jurídico e Financeiro) só serão habilitados numa fase futura, com escopo restrito, aprovação humana e possibilidade de suspensão.</CardBody>
          </Card>
        </>
      ) : null}
    </div>
  );
}
