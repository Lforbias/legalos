import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime, relativeTime } from "@/lib/dates/format";
import { boxV2Enabled } from "@/lib/features";
import { CAPABILITY_LABEL } from "@/lib/judicial/contracts";
import { getCapabilityCatalog, listConnectionCards, type ConnectionCard } from "@/server/judicial/connections.service";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";
import { SourceControls } from "@/modules/box/source-controls";
import { HOMOLOGATION_TONE, StateBadge } from "@/modules/box/present";

export const metadata: Metadata = { title: "Conexões Judiciais" };

const when = (d: Date | null, tz: string) => (d ? `${relativeTime(d)} (${formatDateTime(d, tz)})` : "ainda não");

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function SourceCard({ c, tz, canCheck, canToggle }: { c: ConnectionCard; tz: string; canCheck: boolean; canToggle: boolean }) {
  return (
    <Card data-testid={`connection-${c.kind}-${c.id}`}>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="break-words text-[15px] font-semibold tracking-[-0.01em]">{c.title}</h3>
            <p className="mt-0.5 text-xs text-muted">{c.subtitle}{c.professional ? ` · ${c.professional}` : ""}</p>
          </div>
          <StateBadge state={c.state} label={c.stateLabel} />
        </div>

        <p className="text-sm leading-6">{c.headline}</p>
        {c.nextAction ? (
          <p className="rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-sm"><span className="font-medium">Próximo passo:</span> {c.nextAction}</p>
        ) : null}

        <dl className="grid gap-3 sm:grid-cols-3">
          <Fact label="Última consulta concluída">{when(c.lastSuccessAt, tz)}</Fact>
          <Fact label="Última publicação recebida">{when(c.lastCaptureAt, tz)}</Fact>
          <Fact label="O que já foi comprovado">{c.coverageLabel ?? "Nada comprovado ainda"}</Fact>
        </dl>

        <SourceControls kind={c.kind} id={c.id} enabled={c.enabled} canCheck={canCheck} canToggle={canToggle} />

        <details className="rounded-lg border border-border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">O que esta conexão faz hoje</summary>
          <div className="space-y-3 border-t border-border px-3 py-3">
            <ul className="space-y-1.5 text-sm">
              {c.capabilities.map((cap) => (
                <li key={cap.op} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{cap.label}</span>
                  <Badge tone={HOMOLOGATION_TONE[cap.state]}>{cap.stateLabel}</Badge>
                </li>
              ))}
            </ul>
            {c.limitations.length ? (
              <div>
                <p className="text-xs font-medium text-muted">Limites que você precisa conhecer</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">{c.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
              </div>
            ) : null}
          </div>
        </details>

        {c.technical ? (
          <details className="rounded-lg border border-border" data-testid="technical-details">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Detalhes técnicos (administradores)</summary>
            <div className="space-y-3 border-t border-border px-3 py-3 text-sm">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Fact label="Conector">{c.technical.connectorKey} · v{c.technical.connectorVersion}</Fact>
                <Fact label="Método de acesso">{c.technical.accessMethod}</Fact>
                <Fact label="Motivo do estado">{c.technical.reason}</Fact>
                <Fact label="Última mensagem">{c.technical.lastMessage ?? "—"}</Fact>
              </dl>
              {c.technical.failed.length || c.technical.missing.length ? (
                <p className="text-xs text-muted">
                  {c.technical.failed.length ? `Falhando: ${c.technical.failed.map((o) => CAPABILITY_LABEL[o]).join(", ")}. ` : ""}
                  {c.technical.missing.length ? `Sem evidência recente: ${c.technical.missing.map((o) => CAPABILITY_LABEL[o]).join(", ")}.` : ""}
                </p>
              ) : null}
              {c.technical.evidence.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[34rem] text-left text-xs">
                    <caption className="pb-1 text-left font-medium text-muted">Últimas evidências registradas</caption>
                    <thead className="text-muted"><tr><th className="py-1 pr-3 font-medium">Quando</th><th className="pr-3 font-medium">Operação</th><th className="pr-3 font-medium">Resultado</th><th className="pr-3 font-medium">Ambiente</th><th className="font-medium">Resumo</th></tr></thead>
                    <tbody>
                      {c.technical.evidence.map((e, i) => (
                        <tr key={i} className="border-t border-border align-top">
                          <td className="py-1 pr-3">{formatDateTime(e.checkedAt, tz)}</td>
                          <td className="pr-3">{CAPABILITY_LABEL[e.operation]}</td>
                          <td className="pr-3">{e.outcome === "PASSED" ? "Passou" : e.outcome === "FAILED" ? `Falhou${e.reasonCode ? ` (${e.reasonCode})` : ""}` : "Inconclusivo"}</td>
                          <td className="pr-3">{e.environment === "PRODUCTION" ? "Real" : e.environment === "HOMOLOGATION" ? "Homologação" : "Simulado (não conta)"}</td>
                          <td>{e.summary ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {c.technical.runs.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[34rem] text-left text-xs">
                    <caption className="pb-1 text-left font-medium text-muted">Últimas execuções</caption>
                    <thead className="text-muted"><tr><th className="py-1 pr-3 font-medium">Início</th><th className="pr-3 font-medium">Situação</th><th className="pr-3 font-medium">Lidas</th><th className="pr-3 font-medium">Novas</th><th className="pr-3 font-medium">Páginas</th><th className="font-medium">Erro</th></tr></thead>
                    <tbody>
                      {c.technical.runs.map((r) => (
                        <tr key={r.id} className="border-t border-border align-top">
                          <td className="py-1 pr-3">{formatDateTime(r.startedAt, tz)}</td>
                          <td className="pr-3">{r.status}</td>
                          <td className="pr-3 tabular-nums">{r.fetched}</td>
                          <td className="pr-3 tabular-nums">{r.created}</td>
                          <td className="pr-3 tabular-nums">{r.pages}</td>
                          <td>{r.errorCode ? `${r.errorCode}${r.errorMessage ? ` — ${r.errorMessage}` : ""}` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </details>
        ) : null}
      </CardBody>
    </Card>
  );
}

export default async function ConnectionsPage() {
  const { ctx } = await requireTenant();
  if (!boxV2Enabled(ctx.organizationId)) notFound();
  if (!can(ctx, "inbox:read")) return <AccessDenied />;
  const admin = can(ctx, "integrations:manage");
  const [cards, catalog] = await Promise.all([listConnectionCards(ctx), getCapabilityCatalog(ctx)]);

  const operational = cards.filter((c) => c.state === "OPERATIONAL").length;
  const off = cards.filter((c) => c.state === "OFF").length;
  const attention = cards.length - operational - off;

  return (
    <div className="mx-auto max-w-6xl space-y-6" data-testid="box-connections">
      <PageHeader
        title="Conexões Judiciais"
        description="De onde o LegalOS recebe as suas comunicações. Uma conexão só aparece como funcionando depois de uma consulta real bem-sucedida: cadastrar não basta."
        actions={
          admin ? (
            <>
              <Link href="/box/configurar" className={buttonVariants({ variant: "secondary" })}>Assistente de configuração</Link>
              <Link href="/certificados" className={buttonVariants({ variant: "ghost" })}>Certificados digitais</Link>
              <Link href="/integracoes/pje" className={buttonVariants({ variant: "ghost" })}>Acesso ao PJe</Link>
            </>
          ) : null
        }
      />

      {cards.length === 0 ? (
        <Card>
          <CardBody className="space-y-3">
            <h2 className="text-[15px] font-semibold">Nenhuma fonte configurada ainda</h2>
            <p className="text-sm text-muted">Sem uma fonte configurada, nenhuma intimação chega sozinha ao LegalOS. A primeira etapa é cadastrar o advogado e a OAB para acompanhar as publicações do DJEN (que é público e não exige certificado).</p>
            {admin ? <Link href="/box/configurar" className={buttonVariants({})}>Começar a configuração</Link> : <p className="text-sm">Peça a quem administra o escritório para configurar as fontes.</p>}
          </CardBody>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted" data-testid="connections-summary">
            {operational} operacional(is) · {attention} com pendência ou falha{off ? ` · ${off} desligada(s)` : ""}
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {cards.map((c) => (
              <SourceCard key={`${c.kind}:${c.id}`} c={c} tz={ctx.timezone} canCheck={can(ctx, "inbox:write")} canToggle={admin} />
            ))}
          </div>
        </>
      )}

      <Card>
        <CardHeader title="O que o LegalOS faz hoje, fonte por fonte" description="Só o que existe em código e o que já foi comprovado em uso real. Nada aqui promete cobertura nacional." />
        <CardBody className="space-y-4">
          <Alert tone="info">Receber publicações do DJEN é a base. Acesso privado (certificado, login e código), baixar autos e protocolar dependem de cada tribunal e só aparecem como funcionando quando houver comprovação real.</Alert>
          <ul className="divide-y divide-border">
            {catalog.entries.map((e) => (
              <li key={e.key} className="space-y-2 py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">{e.label}</h3>
                  {e.requiresAuthorization ? <Badge>exige autorização do advogado</Badge> : <Badge tone="info">acesso público</Badge>}
                </div>
                {e.implemented.length ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {e.implemented.map((i) => (
                      <li key={i.op}><Badge tone={HOMOLOGATION_TONE[i.state]} title={i.stateLabel}>{i.label}: {i.stateLabel}</Badge></li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">Ainda não há nenhuma função implementada para esta fonte.</p>
                )}
                {e.limitations.length ? <p className="text-xs text-muted">{e.limitations.join(" ")}</p> : null}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {catalog.matrix ? (
        <details className="rounded-xl border border-border bg-surface" data-testid="coverage-matrix">
          <summary className="cursor-pointer px-5 py-4 text-sm font-medium">Matriz de cobertura por tribunal (administradores)</summary>
          <div className="overflow-x-auto border-t border-border px-5 py-4">
            <table className="w-full min-w-[40rem] text-left text-xs">
              <thead className="text-muted"><tr><th className="py-1 pr-3 font-medium">Fonte</th><th className="pr-3 font-medium">Tribunal</th><th className="pr-3 font-medium">Operação</th><th className="pr-3 font-medium">Situação</th><th className="font-medium">Última evidência</th></tr></thead>
              <tbody>
                {catalog.matrix.map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1 pr-3">{r.connectorKey}</td>
                    <td className="pr-3">{r.courtCode === "*" ? "geral" : r.courtCode}</td>
                    <td className="pr-3">{CAPABILITY_LABEL[r.operation]}</td>
                    <td className="pr-3"><Badge tone={HOMOLOGATION_TONE[r.state]}>{r.state}</Badge></td>
                    <td>{r.lastEvidenceAt ? `${formatDateTime(r.lastEvidenceAt, ctx.timezone)}${r.lastEnvironment ? ` · ${r.lastEnvironment}` : ""}` : "nunca"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  );
}
