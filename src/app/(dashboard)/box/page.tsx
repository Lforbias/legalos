import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { ReportBars } from "@/components/reports/report-charts";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDate, relativeTime } from "@/lib/dates/format";
import { getBoxDashboard } from "@/server/services/box.service";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Visão geral do Box" };

function Kpi({ label, value, hint, href, tone }: { label: string; value: React.ReactNode; hint?: string; href?: string; tone?: "warning" | "danger" }) {
  const body = (
    <Card className={href ? "transition-colors hover:border-primary/50" : undefined}>
      <CardBody>
        <p className="text-xs text-muted">{label}</p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : ""}`}>{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      </CardBody>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function statusTone(s: string | null): "success" | "danger" | "neutral" {
  if (!s) return "neutral";
  return /ok|success|sucesso/i.test(s) ? "success" : /err|fail|falh/i.test(s) ? "danger" : "neutral";
}

export default async function BoxOverviewPage() {
  const { ctx } = await requireTenant();
  const d = await getBoxDashboard(ctx);
  if (!d.notices && !d.captures && !d.certificates && !d.petitions && !d.integrations) return <AccessDenied />;

  return (
    <div className="mx-auto max-w-6xl" data-testid="box-dashboard">
      <PageHeader
        title="LegalOS Box"
        description="Intimações, capturas dos tribunais, peticionamento e certificados. Tudo calculado do banco, sem números fictícios."
        actions={
          <div>{can(ctx, "integrations:manage") ? <Link href="/box/operacao" className="mr-3 text-sm text-primary-text hover:underline">Operação e auditoria</Link> : null}<Link href="/caixa-de-entrada?leitura=1" className="mr-3 text-sm text-primary-text hover:underline">Leitura integrada</Link>
          <Link href="/" className="text-sm text-primary-text hover:underline" data-testid="box-to-func">
            Ir para o LegalOS Func →
          </Link></div>
        }
      />

      {d.notices ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Na caixa de entrada" value={d.notices.boxes.entrada} hint="sem distribuição" href="/caixa-de-entrada" />
            <Kpi label="Para mim" value={d.notices.boxes.minhas} href="/caixa-de-entrada?responsavel=eu" />
            <Kpi label="Paradas há mais de 3 dias" value={d.notices.stale} hint="novas e sem distribuição" tone={d.notices.stale ? "warning" : undefined} href="/caixa-de-entrada" />
            <Kpi label={`Registradas em ${d.notices.byDay.length} dias`} value={d.notices.total14} hint={`${d.notices.bySource.captured} capturas DJEN/PJe · ${d.notices.bySource.otherImports} outras importações · ${d.notices.bySource.manual} registros manuais/arquivo`} />
          </div>
          <Card className="mt-4">
            <CardHeader title="Intimações registradas por dia" description="Data de entrada no LegalOS, no fuso do escritório. Inclui importação de histórico; não representa a data da publicação nem comprova captura automática." />
            <CardBody>
              <ReportBars title="Intimações por dia" data={d.notices.byDay.map((x) => ({ label: x.day.slice(8, 10) + "/" + x.day.slice(5, 7), count: x.count }))} series={[{ key: "count", label: "Intimações", color: "primary" }]} />
            </CardBody>
          </Card>
        </>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {d.petitions ? (
          <Card>
            <CardHeader title="Peticionamento" description="Petições dos processos que você pode ver." />
            <CardBody>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-xs text-muted">Rascunhos</dt><dd className="text-xl font-semibold tabular-nums">{d.petitions.draft}</dd></div>
                <div><dt className="text-xs text-muted">Em revisão</dt><dd className="text-xl font-semibold tabular-nums">{d.petitions.inReview}</dd></div>
                <div><dt className="text-xs text-muted">Aprovadas</dt><dd className="text-xl font-semibold tabular-nums">{d.petitions.approved}</dd></div>
                <div><dt className="text-xs text-muted">Protocoladas (30 dias)</dt><dd className="text-xl font-semibold tabular-nums">{d.petitions.submitted30}</dd></div>
              </dl>
              {d.petitions.failed ? <p className="mt-3 text-sm text-danger">{d.petitions.failed} petição(ões) com falha no envio.</p> : null}
              <Link href="/peticoes" className="mt-3 inline-block text-sm text-primary-text hover:underline">Abrir peticionamento</Link>
            </CardBody>
          </Card>
        ) : null}

        {d.certificates ? (
          <Card>
            <CardHeader title="Certificados digitais" description="Validade dos certificados do escritório." />
            <CardBody>
              <p className="text-sm">
                <span className="text-xl font-semibold tabular-nums">{d.certificates.active}</span> válido(s)
                {d.certificates.expired ? <span className="ml-3 text-danger">{d.certificates.expired} vencido(s)</span> : null}
              </p>
              {d.certificates.expiring.length ? (
                <ul className="mt-3 divide-y divide-border text-sm">
                  {d.certificates.expiring.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="truncate">{c.label}</span>
                      <Badge tone="warning">vence em {c.daysLeft} dia(s) · {formatDate(c.notAfter, ctx.timezone)}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted">Nenhum certificado vence nos próximos 30 dias.</p>
              )}
              <Link href="/certificados" className="mt-3 inline-block text-sm text-primary-text hover:underline">Gerenciar certificados</Link>
            </CardBody>
          </Card>
        ) : null}
      </div>

      {d.captures ? (
        <Card className="mt-4">
          <CardHeader title="Capturas dos tribunais" description="Última execução de cada monitor (DJEN) e conexão (MNI)." />
          {d.captures.djen.length + d.captures.mni.length === 0 ? (
            <CardBody><p className="text-sm text-muted">Nenhuma captura configurada. <Link href="/integracoes" className="text-primary-text hover:underline">Configurar</Link></p></CardBody>
          ) : (
            <ul className="divide-y divide-border">
              {d.captures.djen.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0"><span className="block truncate">DJEN · {m.label} ({m.oab})</span><span className="block truncate text-xs text-muted">{m.lastMessage ?? "Ainda não executado"}</span></span>
                  <span className="flex shrink-0 items-center gap-2">{!m.enabled ? <Badge>desativado</Badge> : <Badge tone={statusTone(m.lastStatus)}>{m.lastStatus ?? "pendente"}</Badge>}<span className="text-xs text-muted">{m.lastSyncAt ? relativeTime(m.lastSyncAt) : "—"}</span></span>
                </li>
              ))}
              {d.captures.mni.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0"><span className="block truncate">MNI · {m.label} ({m.jtr})</span><span className="block truncate text-xs text-muted">{m.lastMessage ?? "Ainda não executado"}</span></span>
                  <span className="flex shrink-0 items-center gap-2">{!m.enabled ? <Badge>desativado</Badge> : <Badge tone={statusTone(m.lastStatus)}>{m.lastStatus ?? "pendente"}</Badge>}<span className="text-xs text-muted">{m.lastSyncAt ? relativeTime(m.lastSyncAt) : "—"}</span></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {d.integrations ? (
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Chaves de API ativas" value={d.integrations.activeKeys} href="/integracoes" />
          <Kpi label="Webhooks" value={d.integrations.endpoints} hint={d.integrations.disabledEndpoints ? `${d.integrations.disabledEndpoints} desativado(s)` : undefined} href="/integracoes" />
          <Kpi label="Entregas pendentes" value={d.integrations.pendingDeliveries} href="/integracoes" />
          <Kpi label="Entregas com falha (7 dias)" value={d.integrations.failedDeliveries} tone={d.integrations.failedDeliveries ? "danger" : undefined} href="/integracoes" />
        </div>
      ) : null}
    </div>
  );
}
