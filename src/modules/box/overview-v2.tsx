import Link from "next/link";
import { ArrowUpRight, Inbox } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { relativeTime } from "@/lib/dates/format";
import { can, type TenantContext } from "@/server/context";
import { latestBoxCursor } from "@/server/judicial/live";
import { getBoxOverview, type SetupStep } from "@/server/judicial/overview.service";
import { LiveRefresh } from "./live-refresh";
import { originName, SeverityBadge } from "./present";

const SETUP_TEXT: Record<Exclude<SetupStep, "DONE">, { title: string; body: string; cta: string }> = {
  PROFESSIONAL: { title: "Cadastre o advogado e a OAB", body: "É o primeiro passo para as publicações do DJEN chegarem sozinhas. Leva cerca de dois minutos e não exige certificado.", cta: "Começar" },
  MONITORING: { title: "Ligue o monitoramento das publicações", body: "O advogado já está cadastrado. Falta ligar o DJEN e fazer a primeira consulta de verdade.", cta: "Ligar e testar agora" },
  FIRST_CHECK: { title: "Falta uma consulta real concluída", body: "O monitoramento existe, mas nenhuma consulta real foi concluída ainda. Até lá, não dá para afirmar que as publicações estão sendo capturadas.", cta: "Fazer a consulta" },
};

function Kpi({ label, value, hint, href, tone }: { label: string; value: React.ReactNode; hint?: string; href: string; tone?: "warning" }) {
  return (
    <Link href={href} className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <Card className="h-full transition-colors hover:border-primary/50 hover:bg-surface-2/40">
        <CardBody>
          <div className="flex items-start justify-between gap-2"><p className="text-xs leading-5 text-muted">{label}</p><ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden /></div>
          <p className={`mt-3 text-3xl font-semibold tracking-tight tabular-nums ${tone === "warning" ? "text-warning" : ""}`}>{value}</p>
          {hint ? <p className="mt-2 text-xs leading-5 text-muted">{hint}</p> : null}
        </CardBody>
      </Card>
    </Link>
  );
}

/** Visão Geral do Box 2.0: o que chegou, o que está em dia e o que falta — só com dados reais. */
export async function BoxOverviewV2({ ctx }: { ctx: TenantContext }) {
  if (!can(ctx, "inbox:read")) return <AccessDenied />;
  // A marca vem ANTES de ler os dados: o que entrar depois dela é avisado pelo canal ao vivo.
  const cursor = await latestBoxCursor(ctx.organizationId);
  const o = await getBoxOverview(ctx);
  const setupText = o.setup && o.setup.step !== "DONE" ? SETUP_TEXT[o.setup.step] : null;

  return (
    <div className="mx-auto max-w-7xl space-y-6" data-testid="box-dashboard">
      <LiveRefresh cursor={cursor} />
      <PageHeader
        title="LegalOS Box"
        description="Suas comunicações judiciais, a situação real de cada conexão e o que ainda falta configurar."
        actions={
          <>
            <Link href="/dashboard" className={buttonVariants({ variant: "ghost" })} data-testid="box-to-func">Ir para o Func</Link>
            <Link href="/caixa-de-entrada" className={buttonVariants({})}><Inbox className="h-4 w-4" aria-hidden /> Abrir caixa de entrada</Link>
          </>
        }
      />

      {setupText ? (
        <Card className="border-primary/40" data-testid="setup-card">
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-xs font-medium uppercase tracking-wide text-primary-text">Configuração do Box</p>
              <h2 className="mt-1 text-[15px] font-semibold">{setupText.title}</h2>
              <p className="mt-1 text-sm text-muted">{setupText.body}</p>
            </div>
            <Link href="/box/configurar" className={buttonVariants({})}>{setupText.cta}</Link>
          </CardBody>
        </Card>
      ) : null}

      <section aria-labelledby="work-queue">
        <h2 id="work-queue" className="mb-3 text-sm font-semibold">Sua fila de trabalho</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi label="Ainda não vistas no LegalOS" value={o.inbox.notViewed} hint="abrir aqui não dá ciência no tribunal" href="/caixa-de-entrada" />
          <Kpi label="Sem responsável" value={o.inbox.unassigned} hint="aguardando distribuição" href="/caixa-de-entrada" />
          <Kpi label="Para mim" value={o.inbox.mine} href="/caixa-de-entrada?responsavel=eu" />
          <Kpi label="Paradas há mais de 3 dias" value={o.inbox.stale} hint="novas e sem tratamento" tone={o.inbox.stale ? "warning" : undefined} href="/caixa-de-entrada" />
          <Kpi label="Capturadas nas últimas 24 h" value={o.inbox.capturedLast24h} hint={`${o.inbox.total} no total`} href="/caixa-de-entrada" />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Situação das fontes" description="Calculada a partir de consultas reais concluídas." action={<Link href="/box/saude" className="text-xs text-primary-text hover:underline">Operação e Saúde</Link>} />
          {o.health.sources.length === 0 ? (
            <CardBody>
              <Alert tone="warning">Nenhuma fonte configurada: nenhuma intimação chega sozinha ao LegalOS.{can(ctx, "integrations:manage") ? <> <Link href="/box/configurar" className="underline">Configurar agora</Link>.</> : null}</Alert>
            </CardBody>
          ) : (
            <ul className="divide-y divide-border" data-testid="overview-sources">
              {o.health.sources.map((s) => (
                <li key={`${s.kind}:${s.id}`} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">{s.label} <span className="font-normal text-muted">({s.detail})</span></p>
                    <p className="mt-0.5 text-xs leading-5 text-muted">{s.headline}</p>
                  </div>
                  {s.enabled ? <SeverityBadge severity={s.severity} /> : <Badge>Desligada</Badge>}
                </li>
              ))}
            </ul>
          )}
          {o.health.jobsLate ? <p className="border-t border-border px-5 py-3 text-xs text-warning">{o.health.jobsLate} rotina(s) automática(s) fora do horário. Veja em Operação e Saúde.</p> : null}
        </Card>

        <Card>
          <CardHeader title="Últimas comunicações" description="Origem e situação de cada uma, separadas por estado." action={<Link href="/caixa-de-entrada" className="text-xs text-primary-text hover:underline">Ver todas</Link>} />
          {o.latest.length === 0 ? (
            <CardBody><p className="text-sm text-muted" data-testid="no-communications">Nenhuma comunicação recebida ainda.</p></CardBody>
          ) : (
            <ul className="divide-y divide-border" data-testid="latest-communications">
              {o.latest.map((n) => (
                <li key={n.id} className="px-5 py-3">
                  <Link href={`/caixa-de-entrada/${n.id}`} className="block rounded-md focus-visible:outline-2 focus-visible:outline-primary">
                    <p className="truncate text-sm font-medium">{n.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">{originName(n.originKind)}{n.courtCode ? ` · ${n.courtCode}` : ""}{n.caseNumber ? ` · ${n.caseNumber}` : ""} · {relativeTime(n.capturedAt)}</p>
                    <p className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge tone={n.viewed ? "neutral" : "info"}>{n.viewed ? "Vista no LegalOS" : "Não vista no LegalOS"}</Badge>
                      <Badge tone={n.officialAck ? "success" : "neutral"}>{n.officialAck ? "Ciência oficial registrada" : "Sem ciência oficial"}</Badge>
                      {n.assigned ? <Badge>Distribuída</Badge> : <Badge tone="warning">Sem responsável</Badge>}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
