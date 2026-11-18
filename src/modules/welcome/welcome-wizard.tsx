"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Briefcase,
  Building2,
  Check,
  ChevronDown,
  CloudOff,
  CreditCard,
  FileText,
  FolderKanban,
  Gift,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Sparkles,
  Upload,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Brand } from "@/components/layout/brand";
import { cn } from "@/lib/utils";
import { TIMEZONE_OPTIONS } from "@/lib/validation/timezone";
import { ResendVerificationButton } from "@/modules/auth/components";
import { LEGALOS_PLANS, formatBRL } from "@/config/pricing";
import { completeWelcomeOrganizationAction, previewWelcomeGiftCodeAction, releaseWelcomeGiftCodeAction, reserveWelcomeGiftCodeAction, saveWelcomeProgressAction } from "./actions";
import type { GiftCodePreview } from "@/server/services/gift-code.service";
import { BRAZIL_UFS, type WelcomeOfficeDraft, type WelcomeProfile } from "./schemas";

type IconType = React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

const PROFILE_TYPES = [
  { value: "SOLO", title: "Advogado(a) autônomo(a)", detail: "Atuação individual ou com apoio pontual.", Icon: User },
  { value: "LAW_FIRM", title: "Escritório de advocacia", detail: "Equipe jurídica com gestão compartilhada.", Icon: Building2 },
  { value: "IN_HOUSE", title: "Departamento jurídico", detail: "Jurídico interno de uma empresa.", Icon: Briefcase },
] as const;

const AREAS = ["Cível", "Trabalhista", "Família e sucessões", "Previdenciário", "Tributário", "Empresarial", "Consumidor", "Criminal", "Outra"];
const PAINS: { label: string; Icon: IconType }[] = [
  { label: "Organizar processos e prazos", Icon: FolderKanban },
  { label: "Atender e responder clientes", Icon: MessageSquare },
  { label: "Controlar documentos", Icon: FileText },
  { label: "Acompanhar o financeiro", Icon: Wallet },
  { label: "Importar dados de outra plataforma", Icon: Upload },
  { label: "Distribuir o trabalho da equipe", Icon: Users },
];
const FIRST_STEPS = ["Cadastrar clientes", "Organizar processos", "Configurar atendimento", "Configurar financeiro", "Importar dados", "Convidar equipe"];
const PREVIOUS_TOOLS = ["Astrea", "Projuris", "ADVBOX", "Planilhas", "Nenhuma"];

const TEAM_SIZES = [
  { value: "SOLO", label: "Só eu" },
  { value: "2_5", label: "2 a 5 pessoas" },
  { value: "6_15", label: "6 a 15 pessoas" },
  { value: "16_PLUS", label: "16 ou mais" },
] as const;
const VOLUMES = [
  { value: "UNDER_100", label: "Até 100" },
  { value: "100_500", label: "101 a 500" },
  { value: "501_2000", label: "501 a 2.000" },
  { value: "OVER_2000", label: "Mais de 2.000" },
] as const;

const STEPS = [
  { title: "Seu perfil", hint: "Como você atua", lead: "Conte um pouco sobre a sua atuação. Leva menos de um minuto." },
  { title: "Diagnóstico", hint: "Suas prioridades", lead: "Com isso, o LegalOS já começa mostrando o que importa para você." },
  { title: "Seu escritório", hint: "Nome e ativação", lead: "Último passo: dê um nome ao escritório e escolha como começar." },
];

const inputOverlay = "absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed";

function ChoiceTile({ type, name, checked, disabled, onChange, onClick, className, children }: { type: "radio" | "checkbox"; name?: string; checked: boolean; disabled?: boolean; onChange: () => void; onClick?: () => void; className?: string; children: React.ReactNode }) {
  return (
    <label
      className={cn(
        "welcome-tile relative block rounded-2xl border p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/50",
        checked ? "border-primary bg-primary/[0.07] shadow-lg shadow-primary/10" : "border-border bg-surface/70 hover:border-border-strong hover:bg-surface",
        disabled && "cursor-not-allowed opacity-55",
        className,
      )}
    >
      <input type={type} name={name} checked={checked} disabled={disabled} onChange={onChange} onClick={onClick} className={inputOverlay} />
      {checked ? (
        <span aria-hidden className="welcome-pop absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-fg">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      ) : null}
      {children}
    </label>
  );
}

function Chip({ label, checked, onToggle, Icon, type = "checkbox", name, onClick }: { label: string; checked: boolean; onToggle: () => void; Icon?: IconType; type?: "checkbox" | "radio"; name?: string; onClick?: () => void }) {
  return (
    <label
      className={cn(
        "welcome-tile relative inline-flex select-none items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/50",
        checked ? "border-primary bg-primary/10 font-medium text-fg" : "border-border bg-surface/70 text-muted hover:border-border-strong hover:text-fg",
      )}
    >
      <input type={type} name={name} checked={checked} onChange={onToggle} onClick={onClick} className={inputOverlay} />
      {checked ? <Check aria-hidden className="welcome-pop h-3.5 w-3.5 text-primary-text" strokeWidth={3} /> : Icon ? <Icon aria-hidden className="h-3.5 w-3.5" /> : null}
      <span>{label}</span>
    </label>
  );
}

function ChipGroup({ legend, hint, children }: { legend: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2.5">
      <legend className="text-[13px] font-medium text-fg/85">
        {legend}
        {hint ? <span className="ml-1.5 font-normal text-muted">{hint}</span> : null}
      </legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function MultiChips({ legend, hint, values, options, onChange }: { legend: string; hint?: string; values: string[]; options: readonly (string | { label: string; Icon: IconType })[]; onChange: (values: string[]) => void }) {
  return (
    <ChipGroup legend={legend} hint={hint}>
      {options.map((option) => {
        const label = typeof option === "string" ? option : option.label;
        const checked = values.includes(label);
        return <Chip key={label} label={label} Icon={typeof option === "string" ? undefined : option.Icon} checked={checked} onToggle={() => onChange(checked ? values.filter((value) => value !== label) : [...values, label])} />;
      })}
    </ChipGroup>
  );
}

function SingleChips<T extends string>({ legend, value, options, onChange }: { legend: string; value: T | undefined; options: readonly { value: T; label: string }[]; onChange: (value: T | undefined) => void }) {
  const name = React.useId();
  return (
    <ChipGroup legend={legend} hint="(opcional)">
      {options.map((option) => (
        // clicar de novo na opção marcada desmarca: as respostas do diagnóstico são opcionais
        <Chip key={option.value} type="radio" name={name} label={option.label} checked={value === option.value} onToggle={() => onChange(option.value)} onClick={() => { if (value === option.value) onChange(undefined); }} />
      ))}
    </ChipGroup>
  );
}

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter((word) => word.length > 2 || /^[A-Z]/.test(word));
  return (words.slice(0, 2).map((word) => word[0]).join("") || name.trim().slice(0, 2) || "?").toUpperCase();
}

export function WelcomeWizard({ userName, emailVerified, initialStep, initialData, initialOffice, initialGift, initialActivationPath, initialPlanKey, checkoutSandboxReady }: { userName: string; emailVerified: boolean; initialStep: number; initialData: WelcomeProfile; initialOffice: WelcomeOfficeDraft; initialGift: GiftCodePreview | null; initialActivationPath: "TRIAL" | "GIFT" | "SUBSCRIPTION"; initialPlanKey: string; checkoutSandboxReady: boolean }) {
  const router = useRouter();
  const [step, setStep] = React.useState(initialStep);
  const [direction, setDirection] = React.useState<"forward" | "back">("forward");
  const [data, setData] = React.useState<WelcomeProfile>(initialData);
  const [office, setOffice] = React.useState<WelcomeOfficeDraft>(initialOffice);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [creating, setCreating] = React.useState(false);
  const [saveStatus, setSaveStatus] = React.useState<"saving" | "saved" | "error">("saved");
  const saveSequence = React.useRef(0);
  const [giftCode, setGiftCode] = React.useState("");
  const [giftPreview, setGiftPreview] = React.useState<GiftCodePreview | null>(initialGift);
  const [giftMessage, setGiftMessage] = React.useState<string | null>(null);
  const [giftPending, startGiftTransition] = React.useTransition();
  const [giftOpen, setGiftOpen] = React.useState(Boolean(initialGift));
  const [detailsOpen, setDetailsOpen] = React.useState(Boolean(initialOffice.legalName || initialOffice.document));
  const [activationPath, setActivationPath] = React.useState<"TRIAL" | "GIFT" | "SUBSCRIPTION">(initialGift?.alreadyReserved ? "GIFT" : initialActivationPath);
  const [selectedPlanKey, setSelectedPlanKey] = React.useState<string>(LEGALOS_PLANS.some((plan) => plan.id === initialPlanKey) ? initialPlanKey : LEGALOS_PLANS[0].id);
  const firstName = userName.trim().split(/\s+/)[0] ?? "";

  function goTo(nextStep: number) {
    setDirection(nextStep < step ? "back" : "forward");
    setError(null);
    setStep(nextStep);
  }

  function inspectGiftCode(reserve: boolean) {
    setGiftMessage(null);
    startGiftTransition(async () => {
      const result = reserve ? await reserveWelcomeGiftCodeAction(giftCode) : await previewWelcomeGiftCodeAction(giftCode);
      if (!result.ok) {
        setGiftMessage(result.message ?? "Não foi possível validar o código.");
        return;
      }
      setGiftPreview(result.data ?? null);
      if (reserve) {
        setGiftCode("");
        setActivationPath("GIFT");
      }
    });
  }

  function releaseGiftCode() {
    setGiftMessage(null);
    startGiftTransition(async () => {
      const result = await releaseWelcomeGiftCodeAction();
      if (!result.ok) {
        setGiftMessage(result.message ?? "Não foi possível remover a reserva.");
        return;
      }
      setGiftPreview(null);
      setGiftCode("");
      setActivationPath("TRIAL");
    });
  }

  React.useEffect(() => {
    const sequence = ++saveSequence.current;
    const timer = window.setTimeout(() => {
      setSaveStatus("saving");
      void saveWelcomeProgressAction({ currentStep: step, data: { profile: data, office, activationPath, planKey: selectedPlanKey } }).then((result) => {
        if (saveSequence.current === sequence) setSaveStatus(result.ok ? "saved" : "error");
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [step, data, office, activationPath, selectedPlanKey]);

  // Quem confirma o e-mail em outra aba volta para cá: a página se atualiza sozinha e libera a criação.
  React.useEffect(() => {
    if (emailVerified) return;
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [emailVerified, router]);

  function saveAndContinue(nextStep: number) {
    setError(null);
    if (data.oabNumber && !data.oabUf) { setError("Informe a UF correspondente à inscrição OAB."); return; }
    if (!data.oabNumber && data.oabUf) { setError("Informe o número correspondente à UF da OAB."); return; }
    startTransition(async () => {
      const result = await saveWelcomeProgressAction({ currentStep: nextStep, data: { profile: data, office, activationPath, planKey: selectedPlanKey } });
      if (!result.ok) {
        setError(result.message ?? "Não foi possível salvar seu progresso.");
        return;
      }
      goTo(nextStep);
    });
  }

  function finish() {
    setError(null);
    if (!data.professionalType) {
      setError("Escolha o perfil que melhor descreve sua atuação.");
      goTo(1);
      return;
    }
    setCreating(true);
    startTransition(async () => {
      const result = await completeWelcomeOrganizationAction({ ...office, data, activationPath, ...(activationPath === "SUBSCRIPTION" ? { planKey: selectedPlanKey } : {}) });
      if (!result.ok) {
        setCreating(false);
        setError(result.message ?? "Não foi possível criar seu escritório. Seu progresso continua salvo.");
        return;
      }
      router.replace(result.data?.redirectTo ?? "/dashboard");
      router.refresh();
    });
  }

  const giftReserved = Boolean(giftPreview?.alreadyReserved);
  const canCreate = office.name.trim().length >= 2 && emailVerified && !(activationPath === "SUBSCRIPTION" && !checkoutSandboxReady);
  const progress = Math.round(((step - 1) / STEPS.length) * 100 + (office.name.trim().length >= 2 && step === 3 ? 100 / STEPS.length / 2 : 0));

  return (
    <div className="mx-auto grid min-h-dvh w-full max-w-6xl gap-10 px-4 pb-10 pt-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:pt-8">
      <section className="min-w-0">
        <header className="flex items-center justify-between gap-3">
          <Brand />
          <SaveIndicator status={saveStatus} />
        </header>

        <div className="welcome-rise mt-10 space-y-3">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary-text">
            <Sparkles aria-hidden className="h-3.5 w-3.5" /> Começo guiado · etapa {step} de {STEPS.length}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Bem-vindo{firstName ? `, ${firstName}` : ""}.</h1>
          <p className="max-w-xl text-[15px] text-muted">{STEPS[step - 1]?.lead}</p>
        </div>

        <Stepper step={step} progress={progress} onSelect={(target) => goTo(target)} disabled={pending} />

        {!emailVerified ? (
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm">
            <Mail aria-hidden className="h-4 w-4 shrink-0 text-accent-text" />
            <p className="min-w-0 flex-1">Confirme seu e-mail pelo link enviado para criar o escritório e ativar sua conta. Você pode continuar preenchendo esta configuração enquanto isso.</p>
            <ResendVerificationButton />
          </div>
        ) : null}

        {error ? <Alert tone="error" className="mt-5">{error}</Alert> : null}

        <div className="relative mt-6">
          {creating ? <CreatingOverlay activationPath={activationPath} /> : null}

          <div key={step} className={cn("rounded-3xl border border-border bg-surface/80 p-5 shadow-2xl shadow-black/10 backdrop-blur sm:p-8", direction === "forward" ? "welcome-step-forward" : "welcome-step-back")}>
            {step === 1 ? (
              <div className="space-y-8">
                <StepHeading title="Como você trabalha?" description="Isso adapta as sugestões iniciais. Dá para mudar depois." />
                <fieldset className="space-y-3">
                  <legend className="sr-only">Qual perfil combina mais com você?</legend>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {PROFILE_TYPES.map(({ value, title, detail, Icon }) => {
                      const checked = data.professionalType === value;
                      return (
                        <ChoiceTile key={value} type="radio" name="professionalType" checked={checked} onChange={() => setData((current) => ({ ...current, professionalType: value }))}>
                          <span aria-hidden className={cn("mb-4 flex h-11 w-11 items-center justify-center rounded-xl transition-colors", checked ? "bg-primary text-primary-fg" : "bg-surface-3 text-muted")}>
                            <Icon className="h-5 w-5" />
                          </span>
                          <span className="block text-sm font-semibold">{title}</span>
                          <span className="mt-1 block text-xs leading-5 text-muted">{detail}</span>
                        </ChoiceTile>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="rounded-2xl border border-border bg-bg/40 p-4 sm:p-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">Inscrição na OAB <span className="font-normal text-muted">(opcional)</span></p>
                      <p className="mt-0.5 text-xs text-muted">Prepara a identidade profissional do escritório para intimações e documentos.</p>
                    </div>
                    {data.oabNumber && data.oabUf ? (
                      <span className="welcome-pop inline-flex items-center gap-1 rounded-full bg-success-bg px-2.5 py-1 text-xs font-medium text-success">
                        <BadgeCheck aria-hidden className="h-3.5 w-3.5" /> OAB {data.oabNumber}/{data.oabUf}
                      </span>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                    <Field label="Número da OAB" htmlFor="welcome-oab-number"><Input id="welcome-oab-number" inputMode="numeric" maxLength={12} placeholder="Ex.: 123456" value={data.oabNumber} onChange={(event) => setData((current) => ({ ...current, oabNumber: event.target.value.replace(/\D/g, "") }))} /></Field>
                    <Field label="UF da OAB" htmlFor="welcome-oab-uf"><Select id="welcome-oab-uf" value={data.oabUf} onChange={(event) => setData((current) => ({ ...current, oabUf: event.target.value as WelcomeProfile["oabUf"] }))}><option value="">UF</option>{BRAZIL_UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}</Select></Field>
                  </div>
                </div>

                <MultiChips legend="Quais áreas você atende?" hint="(opcional)" values={data.areas} options={AREAS} onChange={(areas) => setData((current) => ({ ...current, areas }))} />

                <StepFooter>
                  <span />
                  <Button type="button" className="h-11 px-6" loading={pending} disabled={!data.professionalType} onClick={() => saveAndContinue(2)}>Continuar<ArrowRight aria-hidden className="h-4 w-4" /></Button>
                </StepFooter>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-8">
                <StepHeading title="Um diagnóstico rápido" description="Tudo opcional. Serve só para orientar a configuração: não ativa integrações nem contrata serviços." />
                <SingleChips legend="Tamanho da equipe" value={data.teamSize} options={TEAM_SIZES} onChange={(teamSize) => setData((current) => ({ ...current, teamSize }))} />
                <div className="grid gap-8 sm:grid-cols-2">
                  <SingleChips legend="Clientes na carteira" value={data.clientVolume} options={VOLUMES} onChange={(clientVolume) => setData((current) => ({ ...current, clientVolume }))} />
                  <SingleChips legend="Processos ou casos ativos" value={data.processVolume} options={VOLUMES} onChange={(processVolume) => setData((current) => ({ ...current, processVolume }))} />
                </div>
                <MultiChips legend="O que você mais quer resolver?" hint="(escolha quantos quiser)" values={data.mainPains} options={PAINS} onChange={(mainPains) => setData((current) => ({ ...current, mainPains }))} />
                <div className="space-y-2.5">
                  <Field label="Ferramenta usada anteriormente (opcional)" htmlFor="welcome-tool">
                    <Input id="welcome-tool" maxLength={100} value={data.previousTool} onChange={(event) => setData((current) => ({ ...current, previousTool: event.target.value }))} placeholder="Ex.: Astrea, planilhas, outra" />
                  </Field>
                  <div className="flex flex-wrap gap-1.5" aria-label="Sugestões de ferramenta">
                    {PREVIOUS_TOOLS.map((tool) => (
                      <button key={tool} type="button" onClick={() => setData((current) => ({ ...current, previousTool: tool }))} className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", data.previousTool === tool ? "border-primary bg-primary/10 text-fg" : "border-border text-muted hover:border-border-strong hover:text-fg")}>
                        {tool}
                      </button>
                    ))}
                  </div>
                </div>
                <StepFooter>
                  <Button type="button" variant="ghost" disabled={pending} onClick={() => goTo(1)}><ArrowLeft aria-hidden className="h-4 w-4" />Voltar</Button>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="ghost" loading={pending} onClick={() => saveAndContinue(3)}>Pular diagnóstico</Button>
                    <Button type="button" className="h-11 px-6" loading={pending} onClick={() => saveAndContinue(3)}>Continuar<ArrowRight aria-hidden className="h-4 w-4" /></Button>
                  </div>
                </StepFooter>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-8">
                <StepHeading title="Configure seu escritório" description="Só o nome é obrigatório. O resto você completa quando quiser." />

                <div className="space-y-4">
                  <Field label="Nome do escritório" htmlFor="welcome-office-name">
                    <Input id="welcome-office-name" className="h-12 text-base" autoComplete="organization" maxLength={100} required placeholder="Ex.: Silva & Associados" value={office.name} onChange={(event) => setOffice((current) => ({ ...current, name: event.target.value }))} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                    <Field label="Cidade (opcional)" htmlFor="welcome-city"><Input id="welcome-city" maxLength={100} value={data.city} onChange={(event) => setData((current) => ({ ...current, city: event.target.value }))} /></Field>
                    <Field label="UF (opcional)" htmlFor="welcome-state"><Input id="welcome-state" maxLength={2} value={data.state} onChange={(event) => setData((current) => ({ ...current, state: event.target.value.toUpperCase() }))} /></Field>
                  </div>
                  <button type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((open) => !open)} className="inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-fg">
                    <ChevronDown aria-hidden className={cn("h-4 w-4 transition-transform", detailsOpen && "rotate-180")} /> Mais detalhes (opcional)
                  </button>
                  {detailsOpen ? (
                    <div className="welcome-rise grid gap-3 rounded-2xl border border-border bg-bg/40 p-4 sm:grid-cols-2">
                      <Field label="Razão social (opcional)" htmlFor="welcome-legal-name">
                        <Input id="welcome-legal-name" maxLength={160} value={office.legalName} onChange={(event) => setOffice((current) => ({ ...current, legalName: event.target.value }))} />
                      </Field>
                      <Field label="CPF/CNPJ para cadastro fiscal (opcional)" htmlFor="welcome-document" hint="Necessário só para faturamento ou documentos.">
                        <Input id="welcome-document" autoComplete="off" maxLength={32} value={office.document} onChange={(event) => setOffice((current) => ({ ...current, document: event.target.value }))} />
                      </Field>
                      <Field label="Fuso horário" htmlFor="welcome-timezone">
                        <Select id="welcome-timezone" value={office.timezone} onChange={(event) => setOffice((current) => ({ ...current, timezone: event.target.value }))}>
                          {TIMEZONE_OPTIONS.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
                        </Select>
                      </Field>
                    </div>
                  ) : null}
                </div>

                <MultiChips legend="O que você quer organizar primeiro?" hint="(opcional)" values={data.firstSteps} options={FIRST_STEPS} onChange={(firstSteps) => setData((current) => ({ ...current, firstSteps }))} />

                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold">Como deseja começar?</h3>
                    <p className="mt-1 text-xs text-muted">Criar o escritório não inicia cobrança. Uma contratação exige confirmação posterior na página do provedor.</p>
                  </div>
                  {giftReserved ? (
                    <Alert tone="info">O benefício reservado será aplicado ao criar o escritório. Para escolher avaliação ou assinatura, remova primeiro a reserva abaixo.</Alert>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ChoiceTile type="radio" name="activation-path" checked={activationPath === "TRIAL"} onChange={() => setActivationPath("TRIAL")}>
                        <span className="flex items-center gap-2 text-sm font-semibold"><Sparkles aria-hidden className="h-4 w-4 text-primary-text" />Avaliação gratuita</span>
                        <span className="mt-1 block text-xs leading-5 text-muted">14 dias com tudo liberado, sem cobrança automática ao terminar.</span>
                      </ChoiceTile>
                      <ChoiceTile type="radio" name="activation-path" checked={activationPath === "SUBSCRIPTION"} disabled={!checkoutSandboxReady} onChange={() => setActivationPath("SUBSCRIPTION")}>
                        <span className="flex items-center gap-2 text-sm font-semibold"><CreditCard aria-hidden className="h-4 w-4 text-accent-text" />Escolher assinatura</span>
                        <span className="mt-1 block text-xs leading-5 text-muted">{checkoutSandboxReady ? "Veja o plano e confirme depois no checkout seguro." : "Checkout em sandbox ainda não está disponível nesta instalação."}</span>
                      </ChoiceTile>
                    </div>
                  )}
                  {activationPath === "SUBSCRIPTION" && !giftReserved ? (
                    <div className="welcome-rise grid gap-3 sm:grid-cols-2">
                      {LEGALOS_PLANS.map((plan) => (
                        <ChoiceTile key={plan.id} type="radio" name="welcome-plan" checked={selectedPlanKey === plan.id} onChange={() => setSelectedPlanKey(plan.id)}>
                          <span className="flex items-baseline justify-between gap-2 pr-6"><span className="text-sm font-semibold">{plan.name}</span><span className="text-sm font-semibold">{formatBRL(plan.price)}/mês</span></span>
                          <span className="mt-1 block text-xs text-muted">Até {plan.users} usuários · {plan.processes.toLocaleString("pt-BR")} processos{plan.whatsappNumbers ? ` · ${plan.whatsappNumbers} número(s) de WhatsApp` : ""}</span>
                        </ChoiceTile>
                      ))}
                    </div>
                  ) : null}

                  <div className="rounded-2xl border border-dashed border-border-strong/70 p-4">
                    <button type="button" aria-expanded={giftOpen} onClick={() => setGiftOpen((open) => !open)} className="flex w-full items-center gap-2 text-left text-sm font-medium">
                      <Gift aria-hidden className="h-4 w-4 text-primary-text" />
                      <span className="flex-1">Tenho um código-presente</span>
                      <ChevronDown aria-hidden className={cn("h-4 w-4 text-muted transition-transform", giftOpen && "rotate-180")} />
                    </button>
                    {giftOpen ? (
                      <div className="welcome-rise mt-4 space-y-3">
                        <p className="text-xs text-muted">Confira o benefício e a validade antes de reservar. O código só é aplicado quando você cria o escritório.</p>
                        {giftMessage ? <Alert tone="error">{giftMessage}</Alert> : null}
                        {!giftReserved ? (
                          <div className="flex flex-wrap items-end gap-2">
                            <div className="min-w-56 flex-1"><Field label="Código" htmlFor="welcome-gift-code">
                              <Input id="welcome-gift-code" className="font-mono tracking-wider" autoComplete="off" maxLength={50} value={giftCode} onChange={(event) => setGiftCode(event.target.value.toUpperCase())} placeholder="LOS-…" />
                            </Field></div>
                            <Button type="button" variant="secondary" loading={giftPending} disabled={!giftCode.trim()} onClick={() => inspectGiftCode(false)}>Ver benefício</Button>
                          </div>
                        ) : null}
                        {giftPreview ? (
                          <div className={cn("welcome-pop space-y-2 rounded-xl border p-4 text-sm", giftReserved ? "border-success/40 bg-success-bg" : "border-primary/30 bg-primary/[0.06]")}>
                            <p><strong>{giftPreview.label}:</strong> {giftPreview.benefitType === "PLAN_ACCESS" ? `${giftPreview.planName} gratuito por ${giftPreview.accessDays} dias, sem renovação automática.` : `${giftPreview.accessDays} dias adicionais de teste gratuito.`}</p>
                            {giftPreview.expiresAt ? <p className="text-xs text-muted">Código válido até {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(giftPreview.expiresAt))}.</p> : null}
                            {giftReserved ? (
                              <div className="space-y-2"><p className="text-xs">Benefício reservado para esta conta. Será aplicado ao criar o escritório e expira se o cadastro não for concluído em 24 horas.</p><Button type="button" size="sm" variant="secondary" loading={giftPending} onClick={releaseGiftCode}>Remover reserva</Button></div>
                            ) : (
                              <Button type="button" size="sm" loading={giftPending} disabled={!emailVerified} onClick={() => inspectGiftCode(true)}>Reservar benefício</Button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </section>

                <p role="status" className="flex items-start gap-2 rounded-xl bg-surface-2 px-4 py-3 text-xs leading-5 text-muted">
                  <BadgeCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>
                    {activationPath === "SUBSCRIPTION" && !giftReserved
                      ? "Seu escritório começa com a avaliação gratuita de 14 dias. O plano escolhido não será contratado até você confirmar a contratação na página de cobrança; não há cobrança automática ao fim da avaliação."
                      : giftReserved && giftPreview
                      ? giftPreview.benefitType === "PLAN_ACCESS" ? `Ao criar o escritório, ${giftPreview.planName} ficará ativo por ${giftPreview.accessDays} dias, sem cobrança automática.` : `Ao criar o escritório, você terá 14 dias de avaliação mais ${giftPreview.accessDays} dias de benefício, sem cobrança automática.`
                      : "Ao criar o escritório, começa o período de avaliação gratuita de 14 dias. Não há cobrança automática ao fim do período."}
                  </span>
                </p>

                <StepFooter>
                  <Button type="button" variant="ghost" disabled={pending} onClick={() => goTo(2)}><ArrowLeft aria-hidden className="h-4 w-4" />Voltar</Button>
                  <div className="flex flex-col items-end gap-1.5">
                    <Button type="button" className="h-11 px-6" loading={pending} disabled={!canCreate} onClick={finish}>
                      {activationPath === "SUBSCRIPTION" ? "Criar escritório e seguir para contratação" : activationPath === "GIFT" ? "Criar escritório e ativar benefício" : "Criar escritório e começar"}
                    </Button>
                    {!emailVerified ? <span className="inline-flex items-center gap-1 text-xs text-muted"><Mail aria-hidden className="h-3.5 w-3.5" />Confirme seu e-mail para liberar a criação.</span> : null}
                  </div>
                </StepFooter>
              </div>
            ) : null}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted">Já recebeu um convite para entrar em uma equipe? Abra o link recebido. Não é necessário criar outro escritório.</p>
      </section>

      <WorkspacePreview data={data} office={office} activationPath={activationPath} gift={giftReserved ? giftPreview : null} step={step} />
    </div>
  );
}

function StepHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>
    </div>
  );
}

function StepFooter({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">{children}</div>;
}

function SaveIndicator({ status }: { status: "saving" | "saved" | "error" }) {
  return (
    <p aria-live="polite" className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs", status === "error" ? "border-danger/40 text-danger" : "border-border text-muted")}>
      {status === "error" ? <CloudOff aria-hidden className="h-3.5 w-3.5" /> : status === "saving" ? <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" /> : <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />}
      {status === "error" ? "Não foi possível salvar agora; tente novamente." : status === "saving" ? "Salvando…" : <><span className="hidden sm:inline">Progresso salvo automaticamente</span><span className="sm:hidden">Salvo</span></>}
    </p>
  );
}

function Stepper({ step, progress, onSelect, disabled }: { step: number; progress: number; onSelect: (step: number) => void; disabled: boolean }) {
  return (
    <nav aria-label="Etapas de configuração" className="mt-8">
      <div className="relative mb-4 h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-[width] duration-700 ease-out" style={{ width: `${Math.max(progress, 6)}%` }} />
      </div>
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((item, index) => {
          const number = index + 1;
          const active = number === step;
          const complete = number < step;
          const content = (
            <>
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors", complete ? "bg-primary text-primary-fg" : active ? "bg-fg text-bg" : "bg-surface-3 text-muted")}>
                {complete ? <Check aria-hidden className="welcome-pop h-3.5 w-3.5" strokeWidth={3} /> : number}
              </span>
              <span className="min-w-0 text-left">
                <span className={cn("block truncate text-xs font-semibold sm:text-sm", active ? "text-fg" : complete ? "text-fg/80" : "text-muted")}>{item.title}</span>
                <span className="hidden truncate text-xs text-muted sm:block">{item.hint}</span>
              </span>
            </>
          );
          return (
            <li key={item.title} aria-current={active ? "step" : undefined}>
              {complete ? (
                <button type="button" disabled={disabled} onClick={() => onSelect(number)} className="flex w-full items-center gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-surface-2" aria-label={`Voltar para ${item.title}`}>{content}</button>
              ) : (
                <div className="flex items-center gap-2.5 p-1.5">{content}</div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

const PROFILE_LABEL: Record<string, string> = { SOLO: "Advocacia autônoma", LAW_FIRM: "Escritório de advocacia", IN_HOUSE: "Departamento jurídico" };
const TEAM_LABEL: Record<string, string> = { SOLO: "Só você", "2_5": "2 a 5 pessoas", "6_15": "6 a 15 pessoas", "16_PLUS": "16+ pessoas" };

function WorkspacePreview({ data, office, activationPath, gift, step }: { data: WelcomeProfile; office: WelcomeOfficeDraft; activationPath: "TRIAL" | "GIFT" | "SUBSCRIPTION"; gift: GiftCodePreview | null; step: number }) {
  const checks = [Boolean(data.professionalType), Boolean(data.oabNumber && data.oabUf), data.areas.length > 0, Boolean(data.teamSize), data.mainPains.length > 0, office.name.trim().length >= 2, Boolean(data.city)];
  const completeness = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const name = office.name.trim();
  const focus = data.firstSteps.length ? data.firstSteps : data.mainPains;
  const location = [data.city, data.state].filter(Boolean).join(" · ");

  return (
    <aside aria-label="Prévia do seu espaço" className="hidden lg:block">
      <div className="sticky top-8 space-y-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">Prévia do seu espaço</p>
        <div className="overflow-hidden rounded-3xl border border-border bg-surface/90 shadow-2xl shadow-black/15 backdrop-blur">
          <div className="welcome-avatar h-20 opacity-90" aria-hidden />
          <div className="-mt-9 space-y-5 p-5">
            <div className="flex items-end gap-3">
              <span key={initials(name)} className="welcome-pop welcome-avatar flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-4 border-surface text-lg font-bold text-white shadow-lg">{name ? initials(name) : <Building2 aria-hidden className="h-6 w-6" />}</span>
              <div className="min-w-0 pb-1">
                <p className={cn("truncate text-base font-semibold", !name && "text-muted")}>{name || "Seu escritório"}</p>
                <p className="flex items-center gap-1 truncate text-xs text-muted">
                  {location ? <><MapPin aria-hidden className="h-3 w-3" />{location}</> : data.professionalType ? PROFILE_LABEL[data.professionalType] : "Perfil a definir"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {data.professionalType && location ? <PreviewTag>{PROFILE_LABEL[data.professionalType]}</PreviewTag> : null}
              {data.oabNumber && data.oabUf ? <PreviewTag tone="success">OAB {data.oabNumber}/{data.oabUf}</PreviewTag> : null}
              {data.teamSize ? <PreviewTag>{TEAM_LABEL[data.teamSize]}</PreviewTag> : null}
              {data.areas.map((area) => <PreviewTag key={area}>{area}</PreviewTag>)}
              {!data.professionalType && !data.areas.length ? <span className="text-xs text-muted">Suas escolhas aparecem aqui conforme você responde.</span> : null}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted">{data.firstSteps.length ? "Primeiros passos" : "Foco inicial"}</p>
              {focus.length ? (
                <ul className="space-y-1.5">
                  {focus.slice(0, 4).map((item) => (
                    <li key={item} className="welcome-rise flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs">
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />{item}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="space-y-1.5" aria-hidden>
                  {[0, 1, 2].map((index) => <div key={index} className="h-8 rounded-lg bg-surface-2/70" style={{ opacity: 1 - index * 0.25 }} />)}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-xs">
              {gift ? <Gift aria-hidden className="h-4 w-4 text-primary-text" /> : <Sparkles aria-hidden className="h-4 w-4 text-primary-text" />}
              <span className="text-fg/85">{gift ? gift.label : activationPath === "SUBSCRIPTION" ? "Assinatura após a avaliação" : "14 dias grátis"}</span>
              <span className="ml-auto text-muted">sem cobrança automática</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface/60 p-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-medium">Configuração {step === 3 && name ? "quase pronta" : "em andamento"}</span>
            <span className="tabular-nums text-muted">{completeness}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <div className="h-full rounded-full bg-success transition-[width] duration-700 ease-out" style={{ width: `${completeness}%` }} />
          </div>
        </div>
      </div>
    </aside>
  );
}

function PreviewTag({ children, tone }: { children: React.ReactNode; tone?: "success" }) {
  return <span className={cn("welcome-pop inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium", tone === "success" ? "bg-success-bg text-success" : "bg-surface-3 text-fg/80")}>{children}</span>;
}

function CreatingOverlay({ activationPath }: { activationPath: "TRIAL" | "GIFT" | "SUBSCRIPTION" }) {
  const items = ["Criando o escritório", activationPath === "GIFT" ? "Aplicando o benefício" : "Ativando a avaliação gratuita", "Preparando o seu painel"];
  return (
    <div role="status" className="welcome-rise absolute inset-0 z-20 flex items-center justify-center rounded-3xl bg-bg/80 backdrop-blur-sm">
      <div className="space-y-4 text-center">
        <span className="welcome-avatar mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg"><Loader2 aria-hidden className="h-6 w-6 animate-spin" /></span>
        <ul className="space-y-2 text-sm">
          {items.map((item, index) => (
            <li key={item} className="welcome-rise flex items-center justify-center gap-2 text-muted" style={{ animationDelay: `${index * 350}ms` }}>
              <Check aria-hidden className="h-4 w-4 text-success" />{item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
