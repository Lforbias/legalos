import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { AddMember, MemberRow } from "@/modules/comercial/admin-forms";
import { requireComercial } from "@/server/comercial";
import { listTeam } from "@/server/services/comercial.service";

export const metadata: Metadata = { title: "LegalOS Comercial — equipe" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const { cx } = await requireComercial();
  const t = await listTeam(cx);
  return (
    <div className="space-y-4">
      <PageHeader title="Equipe comercial" description="Quem pode usar o Comercial. É um espaço separado dos escritórios clientes: a equipe daqui não vê processos nem clientes de ninguém. Cada pessoa precisa ter conta e verificação em duas etapas (2FA) ativa." />
      <Card><CardHeader title="Pessoas" /><CardBody>
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm">
          <thead><tr className="text-xs text-muted"><th className="py-1 pr-3 font-medium">Pessoa</th><th className="py-1 pr-3 font-medium">Papel</th><th className="py-1 pr-3 font-medium">Meta mensal</th><th className="py-1 font-medium">Acesso</th></tr></thead>
          <tbody>
            {t.members.map((m) => <MemberRow key={m.userId} m={m} self={m.userId === cx.userId} />)}
            {t.members.length === 0 ? <tr><td colSpan={4} className="py-3 text-muted">Ninguém além dos administradores da plataforma.</td></tr> : null}
          </tbody>
        </table></div>
        <p className="mt-3 text-xs text-muted">Administradores da plataforma (acesso total ao Comercial): {t.admins.map((a) => a.name).join(", ") || "—"}.</p>
      </CardBody></Card>
      {cx.role === "GERENTE" ? <Card><CardHeader title="Adicionar pessoa" /><CardBody><AddMember /></CardBody></Card> : <p className="text-sm text-muted">Só a gerência adiciona ou altera pessoas.</p>}
    </div>
  );
}
