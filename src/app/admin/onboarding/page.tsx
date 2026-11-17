import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LEGALOS_PLANS } from "@/config/pricing";
import { requirePlatform } from "@/server/platform";
import { getWelcomeFunnelMetrics } from "@/server/services/welcome-onboarding.service";

export const metadata: Metadata = { title: "Administração — ativação Welcome" };
export const dynamic = "force-dynamic";

export default async function WelcomeMetricsPage() {
  const { pc } = await requirePlatform();
  const metrics = await getWelcomeFunnelMetrics(pc);
  const selections = Object.entries(metrics.planSelections).map(([key, count]) => ({ key, count, label: LEGALOS_PLANS.find((plan) => plan.id === key)?.name ?? (key === "unspecified" ? "Sem seleção" : key) }));
  const actionLabels = { client: "Primeiro cliente", case: "Primeiro processo/caso", team: "Ativação da equipe", documents: "Primeiro documento", messaging: "Atendimento conectado" };
  return (
    <div className="space-y-5">
      <PageHeader title="Ativação do LegalOS Welcome" description="Métricas agregadas do cadastro e das primeiras ações. O painel não exibe nomes, e-mails nem conteúdo dos escritórios." />
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardBody><p className="text-xs text-muted">Cadastros iniciados</p><p className="mt-1 text-2xl font-semibold tabular-nums">{metrics.started}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-muted">Escritórios criados</p><p className="mt-1 text-2xl font-semibold tabular-nums">{metrics.completed}</p></CardBody></Card>
        <Card><CardBody><p className="text-xs text-muted">Códigos-presente resgatados</p><p className="mt-1 text-2xl font-semibold tabular-nums">{metrics.redeemedGiftCodes}</p></CardBody></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Caminho de ativação escolhido" description="Seleção no cadastro, sem representar contratação." />
          <CardBody className="space-y-2 text-sm">
            {(["TRIAL", "GIFT", "SUBSCRIPTION"] as const).map((path) => <div key={path} className="flex justify-between"><span>{path === "TRIAL" ? "Avaliação gratuita" : path === "GIFT" ? "Código-presente" : "Assinatura"}</span><strong className="tabular-nums">{metrics.activationPaths[path]}</strong></div>)}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Cadastros parados há mais de 7 dias" description="Última etapa salva antes de o cadastro ficar inativo." />
          <CardBody className="space-y-2 text-sm">{metrics.staleByStep.map(({ step, count }) => <div key={step} className="flex justify-between"><span>Etapa {step}</span><strong className="tabular-nums">{count}</strong></div>)}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Planos escolhidos" description="Seleção salva durante o cadastro; não significa contratação ou cobrança." />
          <CardBody className="space-y-2 text-sm">{selections.length ? selections.map(({ key, label, count }) => <div key={key} className="flex justify-between"><span>{label}</span><strong className="tabular-nums">{count}</strong></div>) : <p className="text-muted">Ainda não há seleções.</p>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Primeiras ações concluídas" description="Concluídas quando o LegalOS encontra o registro correspondente no escritório." />
          <CardBody className="space-y-2 text-sm">{Object.entries(actionLabels).map(([key, label]) => <div key={key} className="flex justify-between"><span>{label}</span><strong className="tabular-nums">{metrics.firstActions[key] ?? 0}</strong></div>)}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Pagamentos confirmados" description="Organizações do Welcome com fatura paga confirmada pelo provedor." />
          <CardBody><p className="text-2xl font-semibold tabular-nums">{metrics.paidOrganizations}</p><p className="mt-1 text-xs text-muted">A homologação do Asaas segue pendente; este indicador só muda após confirmação registrada pelo webhook.</p></CardBody>
        </Card>
      </div>
    </div>
  );
}
