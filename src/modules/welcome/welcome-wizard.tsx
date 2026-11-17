"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { TIMEZONE_OPTIONS } from "@/lib/validation/timezone";
import { ResendVerificationButton } from "@/modules/auth/components";
import { LEGALOS_PLANS, formatBRL } from "@/config/pricing";
import { completeWelcomeOrganizationAction, previewWelcomeGiftCodeAction, releaseWelcomeGiftCodeAction, reserveWelcomeGiftCodeAction, saveWelcomeProgressAction } from "./actions";
import type { GiftCodePreview } from "@/server/services/gift-code.service";
import { BRAZIL_UFS, type WelcomeOfficeDraft, type WelcomeProfile } from "./schemas";

const PROFILE_TYPES = [
  { value: "SOLO", title: "Advogado(a) autônomo(a)", detail: "Atuação individual ou com apoio pontual." },
  { value: "LAW_FIRM", title: "Escritório de advocacia", detail: "Equipe jurídica com gestão compartilhada." },
  { value: "IN_HOUSE", title: "Departamento jurídico", detail: "Jurídico interno de uma empresa." },
] as const;

const AREAS = ["Cível", "Trabalhista", "Família e sucessões", "Previdenciário", "Tributário", "Empresarial", "Consumidor", "Criminal", "Outra"];
const PAINS = ["Organizar processos e prazos", "Atender e responder clientes", "Controlar documentos", "Acompanhar o financeiro", "Importar dados de outra plataforma", "Distribuir o trabalho da equipe"];
const FIRST_STEPS = ["Cadastrar clientes", "Organizar processos", "Configurar atendimento", "Configurar financeiro", "Importar dados", "Convidar equipe"];

function MultiCheck({ label, values, options, onChange }: { label: string; values: string[]; options: readonly string[]; onChange: (values: string[]) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label key={option} className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={values.includes(option)}
              onChange={(event) => onChange(event.target.checked ? [...values, option] : values.filter((value) => value !== option))}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function WelcomeWizard({ userName, emailVerified, initialStep, initialData, initialOffice, initialGift, initialActivationPath, initialPlanKey, checkoutSandboxReady }: { userName: string; emailVerified: boolean; initialStep: number; initialData: WelcomeProfile; initialOffice: WelcomeOfficeDraft; initialGift: GiftCodePreview | null; initialActivationPath: "TRIAL" | "GIFT" | "SUBSCRIPTION"; initialPlanKey: string; checkoutSandboxReady: boolean }) {
  const router = useRouter();
  const [step, setStep] = React.useState(initialStep);
  const [data, setData] = React.useState<WelcomeProfile>(initialData);
  const [office, setOffice] = React.useState<WelcomeOfficeDraft>(initialOffice);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [saveStatus, setSaveStatus] = React.useState<"saved" | "error">("saved");
  const saveSequence = React.useRef(0);
  const [giftCode, setGiftCode] = React.useState("");
  const [giftPreview, setGiftPreview] = React.useState<GiftCodePreview | null>(initialGift);
  const [giftMessage, setGiftMessage] = React.useState<string | null>(null);
  const [giftPending, startGiftTransition] = React.useTransition();
  const [activationPath, setActivationPath] = React.useState<"TRIAL" | "GIFT" | "SUBSCRIPTION">(initialGift?.alreadyReserved ? "GIFT" : initialActivationPath);
  const [selectedPlanKey, setSelectedPlanKey] = React.useState<string>(LEGALOS_PLANS.some((plan) => plan.id === initialPlanKey) ? initialPlanKey : LEGALOS_PLANS[0].id);

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
      void saveWelcomeProgressAction({ currentStep: step, data: { profile: data, office, activationPath, planKey: selectedPlanKey } }).then((result) => {
        if (saveSequence.current === sequence) setSaveStatus(result.ok ? "saved" : "error");
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [step, data, office, activationPath, selectedPlanKey]);

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
      setStep(nextStep);
    });
  }

  function finish() {
    setError(null);
    if (!data.professionalType) {
      setError("Escolha o perfil que melhor descreve sua atuação.");
      setStep(1);
      return;
    }
    startTransition(async () => {
      const result = await completeWelcomeOrganizationAction({ ...office, data, activationPath, ...(activationPath === "SUBSCRIPTION" ? { planKey: selectedPlanKey } : {}) });
      if (!result.ok) {
        setError(result.message ?? "Não foi possível criar seu escritório. Seu progresso continua salvo.");
        return;
      }
      router.replace(result.data?.redirectTo ?? "/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-primary-text">LegalOS · Começo guiado</p>
        <h1 className="text-2xl font-semibold">Bem-vindo{userName ? `, ${userName.split(/\s+/)[0]}` : ""}.</h1>
        <p className="max-w-2xl text-sm text-muted">Vamos preparar seu espaço de trabalho. Você pode voltar às etapas anteriores, e o progresso fica salvo na sua conta.</p>
      </div>

      <ol aria-label="Etapas de configuração" className="grid grid-cols-3 gap-2">
        {["Seu perfil", "Diagnóstico", "Seu escritório"].map((label, index) => {
          const number = index + 1;
          const active = number === step;
          const complete = number < step;
          return (
            <li key={label} className={`rounded-md border px-3 py-2 text-xs ${active ? "border-primary bg-surface-2 text-fg" : complete ? "border-primary/40 text-primary-text" : "border-border text-muted"}`}>
              <span className="font-semibold">{number}.</span> {label}
            </li>
          );
        })}
      </ol>
      <div className="h-1 overflow-hidden rounded bg-surface-3" aria-hidden="true"><div className="h-full bg-primary transition-all" style={{ width: `${(step / 3) * 100}%` }} /></div>
      <p aria-live="polite" className="text-right text-xs text-muted">
        {saveStatus === "error" ? "Não foi possível salvar agora; tente novamente." : "Progresso salvo automaticamente"}
      </p>

      {!emailVerified ? (
        <Alert tone="info">
          Confirme seu e-mail pelo link enviado para criar o escritório e ativar sua conta. Você pode continuar preenchendo esta configuração enquanto isso. <ResendVerificationButton />
        </Alert>
      ) : null}

      {error ? <Alert tone="error">{error}</Alert> : null}

      {step === 1 ? (
        <Card>
          <CardHeader title="Como você trabalha?" description="Isso ajuda a adaptar as sugestões iniciais. Você pode mudar suas respostas depois." />
          <CardBody className="space-y-5">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Qual perfil combina mais com você?</legend>
              <div className="grid gap-2">
                {PROFILE_TYPES.map((item) => (
                  <label key={item.value} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${data.professionalType === item.value ? "border-primary bg-surface-2" : "border-border"}`}>
                    <input type="radio" name="professionalType" value={item.value} checked={data.professionalType === item.value} onChange={() => setData((current) => ({ ...current, professionalType: item.value }))} />
                    <span><span className="block text-sm font-medium">{item.title}</span><span className="mt-0.5 block text-xs text-muted">{item.detail}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-sm font-medium">Inscrição profissional (opcional)</p>
              <p className="text-xs text-muted">Se você for advogado(a), informe a OAB para preparar a identidade profissional do escritório. Pode deixar para depois.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Número da OAB" htmlFor="welcome-oab-number"><Input id="welcome-oab-number" inputMode="numeric" maxLength={12} value={data.oabNumber} onChange={(event) => setData((current) => ({ ...current, oabNumber: event.target.value.replace(/\D/g, "") }))} /></Field>
                <Field label="UF da OAB" htmlFor="welcome-oab-uf"><Select id="welcome-oab-uf" value={data.oabUf} onChange={(event) => setData((current) => ({ ...current, oabUf: event.target.value as WelcomeProfile["oabUf"] }))}><option value="">Selecione a UF</option>{BRAZIL_UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}</Select></Field>
              </div>
            </div>
            <MultiCheck label="Quais áreas você atende? (opcional)" values={data.areas} options={AREAS} onChange={(areas) => setData((current) => ({ ...current, areas }))} />
            <div className="flex justify-end"><Button type="button" loading={pending} disabled={!data.professionalType} onClick={() => saveAndContinue(2)}>Continuar</Button></div>
          </CardBody>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader title="Um diagnóstico rápido" description="As respostas são opcionais e servem para orientar a configuração; não ativam integrações nem contratam serviços." />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tamanho da equipe" htmlFor="welcome-team-size">
                <Select id="welcome-team-size" value={data.teamSize ?? ""} onChange={(event) => setData((current) => ({ ...current, teamSize: (event.target.value || undefined) as WelcomeProfile["teamSize"] }))}>
                  <option value="">Prefiro não informar</option><option value="SOLO">Só eu</option><option value="2_5">2 a 5 pessoas</option><option value="6_15">6 a 15 pessoas</option><option value="16_PLUS">16 ou mais</option>
                </Select>
              </Field>
              <Field label="Clientes na carteira (estimativa)" htmlFor="welcome-clients">
                <Select id="welcome-clients" value={data.clientVolume ?? ""} onChange={(event) => setData((current) => ({ ...current, clientVolume: (event.target.value || undefined) as WelcomeProfile["clientVolume"] }))}>
                  <option value="">Prefiro não informar</option><option value="UNDER_100">Até 100</option><option value="100_500">101 a 500</option><option value="501_2000">501 a 2.000</option><option value="OVER_2000">Mais de 2.000</option>
                </Select>
              </Field>
              <Field label="Processos ou casos ativos (estimativa)" htmlFor="welcome-cases">
                <Select id="welcome-cases" value={data.processVolume ?? ""} onChange={(event) => setData((current) => ({ ...current, processVolume: (event.target.value || undefined) as WelcomeProfile["processVolume"] }))}>
                  <option value="">Prefiro não informar</option><option value="UNDER_100">Até 100</option><option value="100_500">101 a 500</option><option value="501_2000">501 a 2.000</option><option value="OVER_2000">Mais de 2.000</option>
                </Select>
              </Field>
              <Field label="Ferramenta usada anteriormente (opcional)" htmlFor="welcome-tool">
                <Input id="welcome-tool" maxLength={100} value={data.previousTool} onChange={(event) => setData((current) => ({ ...current, previousTool: event.target.value }))} placeholder="Ex.: Astrea, planilhas, outra" />
              </Field>
            </div>
            <MultiCheck label="O que você mais quer resolver? (opcional)" values={data.mainPains} options={PAINS} onChange={(mainPains) => setData((current) => ({ ...current, mainPains }))} />
            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" variant="secondary" disabled={pending} onClick={() => setStep(1)}>Voltar</Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" loading={pending} onClick={() => saveAndContinue(3)}>Pular diagnóstico</Button>
                <Button type="button" loading={pending} onClick={() => saveAndContinue(3)}>Continuar</Button>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <CardHeader title="Configure seu escritório" description="O nome e o fuso horário são necessários. Os outros dados podem ser preenchidos depois." />
          <CardBody className="space-y-4">
            <Field label="Nome do escritório" htmlFor="welcome-office-name">
              <Input id="welcome-office-name" autoComplete="organization" maxLength={100} required value={office.name} onChange={(event) => setOffice((current) => ({ ...current, name: event.target.value }))} />
            </Field>
            <Field label="Razão social (opcional)" htmlFor="welcome-legal-name">
              <Input id="welcome-legal-name" maxLength={160} value={office.legalName} onChange={(event) => setOffice((current) => ({ ...current, legalName: event.target.value }))} />
            </Field>
            <Field label="CPF/CNPJ para cadastro fiscal (opcional)" htmlFor="welcome-document" hint="Você pode deixar em branco e informar depois, quando precisar para faturamento ou documentos." >
              <Input id="welcome-document" autoComplete="off" maxLength={32} value={office.document} onChange={(event) => setOffice((current) => ({ ...current, document: event.target.value }))} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Cidade (opcional)" htmlFor="welcome-city"><Input id="welcome-city" maxLength={100} value={data.city} onChange={(event) => setData((current) => ({ ...current, city: event.target.value }))} /></Field>
              <Field label="UF (opcional)" htmlFor="welcome-state"><Input id="welcome-state" maxLength={2} value={data.state} onChange={(event) => setData((current) => ({ ...current, state: event.target.value.toUpperCase() }))} /></Field>
              <Field label="Fuso horário" htmlFor="welcome-timezone">
                <Select id="welcome-timezone" value={office.timezone} onChange={(event) => setOffice((current) => ({ ...current, timezone: event.target.value }))}>
                  {TIMEZONE_OPTIONS.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
                </Select>
              </Field>
            </div>
            <MultiCheck label="O que você gostaria de organizar primeiro? (opcional)" values={data.firstSteps} options={FIRST_STEPS} onChange={(firstSteps) => setData((current) => ({ ...current, firstSteps }))} />
            <Card className="border-dashed">
              <CardHeader title="Tenho um código-presente" description="Confira o benefício e a validade antes de reservar. O código só é aplicado quando você cria o escritório." />
              <CardBody className="space-y-3">
                {giftMessage ? <Alert tone="error">{giftMessage}</Alert> : null}
                {!giftPreview?.alreadyReserved ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-56 flex-1"><Field label="Código" htmlFor="welcome-gift-code">
                      <Input id="welcome-gift-code" autoComplete="off" maxLength={50} value={giftCode} onChange={(event) => setGiftCode(event.target.value.toUpperCase())} placeholder="LOS-…" />
                    </Field></div>
                    <Button type="button" variant="secondary" loading={giftPending} disabled={!giftCode.trim()} onClick={() => inspectGiftCode(false)}>Ver benefício</Button>
                  </div>
                ) : null}
                {giftPreview ? (
                  <Alert tone={giftPreview.alreadyReserved ? "success" : "info"}>
                    <div className="space-y-2">
                      <p><strong>{giftPreview.label}:</strong> {giftPreview.benefitType === "PLAN_ACCESS" ? `${giftPreview.planName} gratuito por ${giftPreview.accessDays} dias, sem renovação automática.` : `${giftPreview.accessDays} dias adicionais de teste gratuito.`}</p>
                      {giftPreview.expiresAt ? <p className="text-xs">Código válido até {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(giftPreview.expiresAt))}.</p> : null}
                      {giftPreview.alreadyReserved ? <div className="space-y-2"><p className="text-xs">Benefício reservado para esta conta. Será aplicado ao criar o escritório e expira se o cadastro não for concluído em 24 horas.</p><Button type="button" size="sm" variant="secondary" loading={giftPending} onClick={releaseGiftCode}>Remover reserva</Button></div> : <Button type="button" size="sm" loading={giftPending} disabled={!emailVerified} onClick={() => inspectGiftCode(true)}>Reservar benefício</Button>}
                    </div>
                  </Alert>
                ) : null}
              </CardBody>
            </Card>
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold">Como deseja começar?</h2>
                <p className="mt-1 text-xs text-muted">A criação do escritório não inicia cobrança. A contratação exige confirmação posterior na página do provedor.</p>
              </div>
              {giftPreview?.alreadyReserved ? (
                <Alert tone="info">O benefício reservado será aplicado ao criar o escritório. Para escolher avaliação ou assinatura, remova primeiro a reserva acima.</Alert>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className={`cursor-pointer rounded-md border p-3 ${activationPath === "TRIAL" ? "border-primary bg-surface-2" : "border-border"}`}>
                    <input type="radio" name="activation-path" className="mr-2" checked={activationPath === "TRIAL"} onChange={() => setActivationPath("TRIAL")} />
                    <span className="text-sm font-medium">Avaliação gratuita</span>
                    <p className="mt-1 pl-6 text-xs text-muted">14 dias, sem cobrança automática ao terminar.</p>
                  </label>
                  <label className={`rounded-md border p-3 ${checkoutSandboxReady ? "cursor-pointer" : "cursor-not-allowed opacity-60"} ${activationPath === "SUBSCRIPTION" ? "border-primary bg-surface-2" : "border-border"}`}>
                    <input type="radio" name="activation-path" className="mr-2" checked={activationPath === "SUBSCRIPTION"} disabled={!checkoutSandboxReady} onChange={() => setActivationPath("SUBSCRIPTION")} />
                    <span className="text-sm font-medium">Escolher assinatura</span>
                    <p className="mt-1 pl-6 text-xs text-muted">{checkoutSandboxReady ? "Veja o plano e confirme depois no checkout seguro." : "Checkout em sandbox ainda não está disponível nesta instalação."}</p>
                  </label>
                </div>
              )}
              {activationPath === "SUBSCRIPTION" && !giftPreview?.alreadyReserved ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {LEGALOS_PLANS.map((plan) => (
                    <label key={plan.id} className={`cursor-pointer rounded-md border p-3 ${selectedPlanKey === plan.id ? "border-primary bg-surface-2" : "border-border"}`}>
                      <input type="radio" name="welcome-plan" className="mr-2" checked={selectedPlanKey === plan.id} onChange={() => setSelectedPlanKey(plan.id)} />
                      <span className="text-sm font-medium">{plan.name}</span>
                      <span className="float-right text-sm font-semibold">{formatBRL(plan.price)}/mês</span>
                      <p className="mt-1 pl-6 text-xs text-muted">Até {plan.users} usuários · {plan.processes.toLocaleString("pt-BR")} processos{plan.whatsappNumbers ? ` · ${plan.whatsappNumbers} número(s) de WhatsApp` : ""}</p>
                    </label>
                  ))}
                </div>
              ) : null}
            </section>
            <Alert tone="info">
              {activationPath === "SUBSCRIPTION" && !giftPreview?.alreadyReserved
                ? "Seu escritório começa com a avaliação gratuita de 14 dias. O plano escolhido não será contratado até você confirmar a contratação na página de cobrança; não há cobrança automática ao fim da avaliação."
                : giftPreview?.alreadyReserved
                ? giftPreview.benefitType === "PLAN_ACCESS" ? `Ao criar o escritório, ${giftPreview.planName} ficará ativo por ${giftPreview.accessDays} dias, sem cobrança automática.` : `Ao criar o escritório, você terá 14 dias de avaliação mais ${giftPreview.accessDays} dias de benefício, sem cobrança automática.`
                : "Ao criar o escritório, começa o período de avaliação gratuita de 14 dias. Não há cobrança automática ao fim do período."}
            </Alert>
            <div className="flex flex-wrap justify-between gap-2">
              <Button type="button" variant="secondary" disabled={pending} onClick={() => setStep(2)}>Voltar</Button>
              <Button type="button" loading={pending} disabled={office.name.trim().length < 2 || !emailVerified || (activationPath === "SUBSCRIPTION" && !checkoutSandboxReady)} onClick={finish}>{activationPath === "SUBSCRIPTION" ? "Criar escritório e seguir para contratação" : activationPath === "GIFT" ? "Criar escritório e ativar benefício" : "Criar escritório e começar"}</Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <p className="text-center text-xs text-muted">Já recebeu um convite para entrar em uma equipe? Abra o link recebido. Não é necessário criar outro escritório.</p>
    </div>
  );
}
