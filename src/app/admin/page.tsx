import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { requirePlatform } from "@/server/platform";
import { platformOverview } from "@/server/services/platform.service";

export const metadata: Metadata = { title: "Administração — visão geral" };
export const dynamic = "force-dynamic";

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export default async function AdminHome() {
  const { pc } = await requirePlatform();
  const o = await platformOverview(pc);
  return (
    <div>
      <PageHeader title="Visão geral da plataforma" description="Números reais de todos os escritórios, somente contagens. O painel nunca mostra processos, clientes, documentos nem o teor de intimações." />
      {o.users.locked > 0 || o.security.failedLogins24 >= 20 ? (
        <div className="mb-4">
          <Alert tone="warning">{o.users.locked} conta(s) bloqueada(s) por tentativas e {o.security.failedLogins24} login(s) com falha nas últimas 24 h. Veja a aba Auditoria.</Alert>
        </div>
      ) : null}
      <section aria-label="Escritórios" className="mb-6">
        <h2 className="mb-2 text-sm font-medium">Escritórios</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kpi label="Total" value={o.organizations.total} />
          <Kpi label="Ativos" value={o.organizations.active} />
          <Kpi label="Suspensos" value={o.organizations.suspended} />
          <Kpi label="Novos (30 dias)" value={o.organizations.new30} />
          <Kpi label="Com atividade (7 dias)" value={o.organizations.activeLast7} />
        </div>
      </section>
      <section aria-label="Usuários e segurança" className="mb-6">
        <h2 className="mb-2 text-sm font-medium">Usuários e segurança</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kpi label="Usuários ativos" value={o.users.active} hint={`${o.users.disabled} desativado(s)`} />
          <Kpi label="Com 2FA" value={`${o.users.mfaPct}%`} hint={`${o.users.withMfa} de ${o.users.active}`} />
          <Kpi label="Bloqueados agora" value={o.users.locked} />
          <Kpi label="Logins (7 dias)" value={o.security.logins7} />
          <Kpi label="Logins com falha (24 h)" value={o.security.failedLogins24} />
        </div>
      </section>
      <section aria-label="Volume" className="mb-6">
        <h2 className="mb-2 text-sm font-medium">Volume de dados</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Processos" value={o.volume.cases} />
          <Kpi label="Intimações em aberto" value={o.volume.openNotices} />
          <Kpi label="Prazos em aberto" value={o.volume.openDeadlines} />
          <Kpi label="Documentos" value={o.volume.documents} />
        </div>
      </section>
      <Card>
        <CardHeader title="Uso do assistente de IA (30 dias)" description="Chamadas e tokens registrados; o custo depende do contrato com o provedor." />
        <CardBody className="grid grid-cols-3 gap-3 text-sm">
          <Kpi label="Chamadas" value={o.ai30.calls} />
          <Kpi label="Tokens de entrada" value={o.ai30.inputTokens.toLocaleString("pt-BR")} />
          <Kpi label="Tokens de saída" value={o.ai30.outputTokens.toLocaleString("pt-BR")} />
        </CardBody>
      </Card>
    </div>
  );
}
