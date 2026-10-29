"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ConnectionState } from "@/lib/judicial/connection-state";
import type { CheckOutcome } from "@/server/judicial/onboarding.service";
import { startPublicMonitoringAction } from "./actions";
import { ProfessionalForm } from "./professional-form";
import { SourceControls } from "./source-controls";
import { StateBadge } from "./present";

export type WizardProfessional = { id: string; name: string; oab: string; notifyEmail: string | null; monitor: { id: string; enabled: boolean; verified: boolean } | null };
export type WizardSource = { kind: "DJEN" | "MNI" | "PORTAL"; id: string; title: string; subtitle: string; enabled: boolean; state: ConnectionState | "OFF"; stateLabel: string; headline: string; nextAction: string | null };

const STEPS = [
  { n: 1, label: "Identificação" },
  { n: 2, label: "Publicações (DJEN)" },
  { n: 3, label: "Acesso privado" },
  { n: 4, label: "Validação" },
  { n: 5, label: "Resumo" },
] as const;

const OUTCOME_ALERT = { success: "success", warning: "warning", error: "error" } as const;

function Stepper({ step, onGo, reachable }: { step: number; onGo: (n: number) => void; reachable: number }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-5" aria-label="Etapas da configuração">
      {STEPS.map((s) => {
        const active = s.n === step;
        const enabled = s.n <= reachable;
        return (
          <li key={s.n}>
            <button
              type="button"
              disabled={!enabled}
              aria-current={active ? "step" : undefined}
              onClick={() => onGo(s.n)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                active ? "border-primary bg-surface-2 font-medium text-fg" : "border-border text-muted hover:bg-surface-2",
              )}
            >
              <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px]", s.n < step ? "bg-success-bg text-success" : active ? "bg-primary text-primary-fg" : "bg-surface-3 text-muted")}>{s.n < step ? "✓" : s.n}</span>
              <span>{s.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Nav({ step, onGo, nextLabel, nextDisabled, hint }: { step: number; onGo: (n: number) => void; nextLabel?: string; nextDisabled?: boolean; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <div>{step > 1 ? <Button variant="ghost" onClick={() => onGo(step - 1)}>Voltar</Button> : null}</div>
      <div className="flex flex-wrap items-center gap-3">
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
        {step < 5 ? <Button disabled={nextDisabled} onClick={() => onGo(step + 1)}>{nextLabel ?? "Continuar"}</Button> : null}
      </div>
    </div>
  );
}

/** Roda a consulta real do DJEN para um advogado e mostra o resultado verdadeiro (inclusive falha), com o tempo que levou. */
function PublicMonitoringRow({ p }: { p: WizardProfessional }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [outcome, setOutcome] = React.useState<CheckOutcome | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    if (!pending) return;
    const t = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => {
      window.clearInterval(t);
      setElapsed(0); // zera ao terminar, para a próxima consulta começar do zero
    };
  }, [pending]);

  const run = () =>
    start(async () => {
      setError(null);
      setOutcome(null);
      const r = await startPublicMonitoringAction(p.id);
      if (!r.ok || !r.data) setError(r.message ?? "Não foi possível consultar agora.");
      else setOutcome(r.data);
      router.refresh();
    });

  const label = p.monitor?.verified ? "Consultar de novo" : p.monitor ? "Fazer a consulta real agora" : "Ligar e consultar agora";
  return (
    <li className="space-y-3 py-4 first:pt-0 last:pb-0" data-testid={`wizard-professional-${p.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{p.name}</p>
          <p className="text-xs text-muted">OAB {p.oab}</p>
        </div>
        <div className="flex items-center gap-2">
          {p.monitor?.verified ? <Badge tone="success">Verificado com consulta real</Badge> : p.monitor ? <Badge tone="warning">Ligado, sem consulta real concluída</Badge> : <Badge>Ainda não ligado</Badge>}
          <Button size="sm" variant={p.monitor?.verified ? "secondary" : "primary"} loading={pending} onClick={run}>{label}</Button>
        </div>
      </div>
      <div aria-live="polite" className="space-y-2">
        {pending ? <p className="text-xs text-muted">Consultando o DJEN… {elapsed} s</p> : null}
        {error ? <Alert tone="error">{error}</Alert> : null}
        {outcome ? (
          <Alert tone={OUTCOME_ALERT[outcome.tone]}>
            <strong className="font-medium">{outcome.title}.</strong> {outcome.detail} <span className="text-xs opacity-80">(levou {Math.max(1, Math.round(outcome.durationMs / 1000))} s)</span>
          </Alert>
        ) : null}
      </div>
    </li>
  );
}

function SourceLine({ s, canCheck }: { s: WizardSource; canCheck: boolean }) {
  return (
    <li className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium">{s.title}</p>
          <p className="text-xs text-muted">{s.subtitle}</p>
        </div>
        <StateBadge state={s.state} label={s.stateLabel} />
      </div>
      <p className="text-sm text-muted">{s.headline}</p>
      {s.nextAction ? <p className="text-sm"><span className="font-medium">Próximo passo:</span> {s.nextAction}</p> : null}
      <SourceControls kind={s.kind} id={s.id} enabled={s.enabled} canCheck={canCheck} canToggle={false} />
    </li>
  );
}

export function OnboardingWizard({ ufs, defaultUf, professionals, sources, initialStep, canCheck }: { ufs: string[]; defaultUf: string; professionals: WizardProfessional[]; sources: WizardSource[]; initialStep: number; canCheck: boolean }) {
  const [step, setStep] = React.useState(Math.min(Math.max(initialStep, 1), 5));
  const hasProfessional = professionals.length > 0;
  const reachable = hasProfessional ? 5 : 1;
  const go = (n: number) => setStep(Math.min(Math.max(n, 1), hasProfessional ? 5 : 1));
  const publicSources = sources.filter((s) => s.kind === "DJEN");
  const privateSources = sources.filter((s) => s.kind !== "DJEN");
  const working = sources.filter((s) => s.state === "OPERATIONAL");
  const pending = sources.filter((s) => s.state !== "OPERATIONAL");
  const anyVerified = professionals.some((p) => p.monitor?.verified);

  return (
    <div className="space-y-5" data-testid="onboarding-wizard">
      <Stepper step={step} onGo={go} reachable={reachable} />

      {step === 1 ? (
        <Card>
          <CardHeader title="Quem o Box vai acompanhar" description="Cadastre cada advogado com a sua OAB. O mesmo número de OAB não pode ser cadastrado duas vezes no escritório." />
          <CardBody className="space-y-5">
            {professionals.length ? (
              <ul className="divide-y divide-border rounded-lg border border-border" data-testid="wizard-professionals">
                {professionals.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-muted">OAB {p.oab}{p.notifyEmail ? ` · avisos para ${p.notifyEmail}` : ""}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="max-w-xl">
              <h3 className="mb-2 text-sm font-medium">{professionals.length ? "Cadastrar outro advogado ou OAB" : "Cadastrar o primeiro advogado"}</h3>
              <ProfessionalForm ufs={ufs} defaultUf={defaultUf} submitLabel={professionals.length ? "Cadastrar outro" : "Cadastrar advogado"} />
            </div>
            <Nav step={1} onGo={go} nextDisabled={!hasProfessional} hint={hasProfessional ? undefined : "Cadastre ao menos um advogado para continuar."} />
          </CardBody>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader title="Publicações do DJEN" description="O DJEN é público e não pede certificado nem senha. O LegalOS faz agora uma consulta de verdade e mostra o que o tribunal respondeu." />
          <CardBody className="space-y-5">
            <ul className="divide-y divide-border">
              {professionals.map((p) => <PublicMonitoringRow key={p.id} p={p} />)}
            </ul>
            <Alert tone="info">“Funciona” aqui significa que a consulta foi concluída de ponta a ponta. Se o DJEN estiver fora do ar, você verá isso claramente e o LegalOS tenta de novo sozinho; nada é marcado como pronto sem consulta real.</Alert>
            <Nav step={2} onGo={go} nextLabel={anyVerified ? "Continuar" : "Continuar mesmo assim"} hint={anyVerified ? undefined : "Você pode continuar e voltar depois."} />
          </CardBody>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <CardHeader title="Acesso privado (opcional agora)" description="Intimações que não saem no diário dependem de acesso autorizado por você em cada tribunal. Dá para pular e fazer depois." />
          <CardBody className="space-y-5">
            <ul className="grid gap-3 md:grid-cols-2">
              <li className="rounded-lg border border-border p-4">
                <h3 className="text-sm font-medium">Certificado digital A1</h3>
                <p className="mt-1 text-sm text-muted">Guardado cifrado no cofre. Consultar e assinar são permissões separadas: ter o certificado cadastrado não libera assinar nem peticionar. Um A1 não dá acesso automático a todos os tribunais.</p>
                <Link href="/certificados" className="mt-2 inline-block text-sm text-primary-text hover:underline">Abrir certificados</Link>
              </li>
              <li className="rounded-lg border border-border p-4">
                <h3 className="text-sm font-medium">Login do advogado no portal (PJe)</h3>
                <p className="mt-1 text-sm text-muted">Você informa o login uma vez; se o tribunal pedir código de verificação, o LegalOS pede a você na hora. O LegalOS não contorna captcha nem verificação em duas etapas.</p>
                <Link href="/integracoes/pje" className="mt-2 inline-block text-sm text-primary-text hover:underline">Conectar o PJe</Link>
              </li>
              <li className="rounded-lg border border-border p-4">
                <h3 className="text-sm font-medium">Conexão oficial do tribunal</h3>
                <p className="mt-1 text-sm text-muted">Para tribunais que oferecem acesso oficial a sistemas (por exemplo, eproc). Cada tribunal precisa ser validado separadamente antes de aparecer como funcionando.</p>
                <Link href="/integracoes" className="mt-2 inline-block text-sm text-primary-text hover:underline">Abrir integrações</Link>
              </li>
              <li className="rounded-lg border border-border p-4">
                <h3 className="text-sm font-medium">O que o tribunal não permite</h3>
                <p className="mt-1 text-sm text-muted">Alguns tribunais proíbem guardar login e senha. Nesses casos o LegalOS não pede esse dado: mostra o que falta e quem precisa agir.</p>
              </li>
            </ul>
            {privateSources.length ? (
              <div>
                <h3 className="mb-2 text-sm font-medium">Acessos privados já cadastrados</h3>
                <ul className="divide-y divide-border rounded-lg border border-border px-4 py-1">
                  {privateSources.map((s) => (
                    <li key={`${s.kind}:${s.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                      <span className="min-w-0 break-words">{s.title}</span>
                      <StateBadge state={s.state} label={s.stateLabel} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Nav step={3} onGo={go} nextLabel={privateSources.length ? "Continuar" : "Pular por agora"} />
          </CardBody>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card>
          <CardHeader title="Conferência" description="Situação de cada fonte, vinda de consultas reais. Aqui você pode consultar de novo antes de terminar." />
          <CardBody className="space-y-5">
            {sources.length === 0 ? (
              <Alert tone="warning">Nenhuma fonte foi ligada ainda. Volte à etapa de publicações e faça a primeira consulta.</Alert>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border px-4 py-3" data-testid="wizard-validation">
                {[...publicSources, ...privateSources].map((s) => <SourceLine key={`${s.kind}:${s.id}`} s={s} canCheck={canCheck} />)}
              </ul>
            )}
            <Nav step={4} onGo={go} nextLabel="Ver o resumo" />
          </CardBody>
        </Card>
      ) : null}

      {step === 5 ? (
        <Card data-testid="wizard-summary">
          <CardHeader title="Resumo" description="Você pode terminar agora. O que estiver pendente continua aparecendo na Visão Geral e em Conexões Judiciais." />
          <CardBody className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-medium">Funcionando ({working.length})</h3>
                {working.length ? <ul className="space-y-1.5 text-sm">{working.map((s) => <li key={`${s.kind}:${s.id}`} className="flex items-center justify-between gap-2"><span className="min-w-0 break-words">{s.title}</span><Badge tone="success">Operacional</Badge></li>)}</ul> : <p className="text-sm text-muted">Nada comprovado ainda.</p>}
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium">Pendente ({pending.length})</h3>
                {pending.length ? <ul className="space-y-2 text-sm">{pending.map((s) => <li key={`${s.kind}:${s.id}`}><span className="font-medium">{s.title}</span> — {s.nextAction ?? s.headline}</li>)}</ul> : <p className="text-sm text-muted">Nada pendente nas fontes cadastradas.</p>}
              </div>
            </div>
            {!hasProfessional ? <Alert tone="warning">Nenhum advogado cadastrado.</Alert> : null}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <Button variant="ghost" onClick={() => go(4)}>Voltar</Button>
              <div className="flex flex-wrap gap-2">
                <Link href="/box/conexoes" className={buttonVariants({ variant: "secondary" })}>Ver Conexões Judiciais</Link>
                <Link href="/box" className={buttonVariants({})} data-testid="wizard-finish">Concluir e abrir o Box</Link>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
