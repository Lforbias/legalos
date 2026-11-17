"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import type { ActionState } from "@/lib/validation/common";
import { createGiftCodeAction, revokeGiftCodeAction } from "./gift-code-admin-actions";

type GiftCodeRow = { id: string; prefix: string; label: string; benefitType: string; planKey: string | null; accessDays: number; usageLimit: number; redemptions: number; active: boolean; startsAt: Date; expiresAt: Date | null };

export function GiftCodeAdmin({ initialCodes }: { initialCodes: GiftCodeRow[] }) {
  const router = useRouter();
  const [label, setLabel] = React.useState("");
  const [benefitType, setBenefitType] = React.useState<"TRIAL_EXTENSION" | "PLAN_ACCESS">("TRIAL_EXTENSION");
  const [planKey, setPlanKey] = React.useState("intermediario");
  const [accessDays, setAccessDays] = React.useState("14");
  const [usageLimit, setUsageLimit] = React.useState("1");
  const [startsAt, setStartsAt] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [createdCode, setCreatedCode] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [copyState, setCopyState] = React.useState("");

  function create() {
    setMessage(null);
    setCreatedCode(null);
    startTransition(async () => {
      const result = await createGiftCodeAction({ label, benefitType, planKey: benefitType === "PLAN_ACCESS" ? planKey : null, accessDays: Number(accessDays), usageLimit: Number(usageLimit), startsAt: startsAt || null, expiresAt: expiresAt || null, stackable: false });
      if (!result.ok) {
        setMessage(result.message ?? "Não foi possível criar o código.");
        return;
      }
      setCreatedCode(result.data?.code ?? null);
      setLabel("");
      router.refresh();
    });
  }

  function revoke(id: string) {
    setMessage(null);
    startTransition(async () => {
      const result: ActionState = await revokeGiftCodeAction(id);
      if (!result.ok) setMessage(result.message ?? "Não foi possível revogar o código.");
      else router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Criar código-presente" description="Códigos aleatórios, validados no servidor e armazenados por hash. O texto completo aparece uma única vez após a criação." />
        <CardBody className="space-y-4">
          {message ? <Alert tone="error">{message}</Alert> : null}
          {createdCode ? <Alert tone="success"><div className="space-y-2"><p>Código criado. Copie e guarde agora; ele não será exibido novamente.</p><code className="block select-all rounded bg-surface px-2 py-1 font-mono">{createdCode}</code><Button size="sm" variant="secondary" onClick={() => void navigator.clipboard.writeText(createdCode).then(() => setCopyState("Copiado."), () => setCopyState("Selecione e copie o código manualmente."))}>Copiar código</Button> <span className="text-xs">{copyState}</span></div></Alert> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="gift-label" className="mb-1 block text-xs text-muted">Nome da campanha</label><Input id="gift-label" maxLength={100} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ex.: Escritório piloto" /></div>
            <div><label htmlFor="gift-benefit" className="mb-1 block text-xs text-muted">Benefício</label><Select id="gift-benefit" value={benefitType} onChange={(event) => setBenefitType(event.target.value as typeof benefitType)}><option value="TRIAL_EXTENSION">Dias adicionais de teste</option><option value="PLAN_ACCESS">Acesso gratuito a um plano por dias</option></Select></div>
            {benefitType === "PLAN_ACCESS" ? <div><label htmlFor="gift-plan" className="mb-1 block text-xs text-muted">Plano concedido</label><Select id="gift-plan" value={planKey} onChange={(event) => setPlanKey(event.target.value)}><option value="simples">Simples</option><option value="basico">Básico</option><option value="intermediario">Intermediário</option><option value="avancado">Avançado</option></Select></div> : null}
            <div><label htmlFor="gift-days" className="mb-1 block text-xs text-muted">Dias de benefício</label><Input id="gift-days" inputMode="numeric" value={accessDays} onChange={(event) => setAccessDays(event.target.value)} /></div>
            <div><label htmlFor="gift-limit" className="mb-1 block text-xs text-muted">Quantidade máxima de resgates</label><Input id="gift-limit" inputMode="numeric" value={usageLimit} onChange={(event) => setUsageLimit(event.target.value)} /></div>
            <div><label htmlFor="gift-start" className="mb-1 block text-xs text-muted">Válido a partir de (opcional)</label><Input id="gift-start" type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></div>
            <div><label htmlFor="gift-expiry" className="mb-1 block text-xs text-muted">Válido até (opcional)</label><Input id="gift-expiry" type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></div>
          </div>
          <p className="text-xs text-muted">Por política, este benefício não é cumulativo com outros códigos.</p>
          <Button loading={pending} disabled={label.trim().length < 3} onClick={create}>Gerar código</Button>
          <p className="text-xs text-muted">Este gerador concede acesso gratuito ou dias de teste. Descontos temporários ficam desativados até a cobrança recorrente ser homologada.</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Códigos emitidos" description="Reservas expiram após 24 horas se a pessoa não concluir o cadastro. Revogar impede novos resgates e invalida reservas ainda não aplicadas." />
        <CardBody className="overflow-x-auto">
          {initialCodes.length === 0 ? <p className="text-sm text-muted">Nenhum código foi criado.</p> : (
            <table className="w-full text-left text-xs">
              <thead className="text-muted"><tr><th className="py-2">Código</th><th>Campanha</th><th>Benefício</th><th>Usos</th><th>Validade</th><th>Situação</th><th /></tr></thead>
              <tbody>{initialCodes.map((code) => <tr key={code.id} className="border-t border-border"><td className="py-2 font-mono">{code.prefix}…</td><td>{code.label}</td><td>{code.benefitType === "PLAN_ACCESS" ? `${code.planKey} · ${code.accessDays} dias` : `${code.accessDays} dias de teste`}</td><td>{code.redemptions}/{code.usageLimit}</td><td>{code.expiresAt ? new Intl.DateTimeFormat("pt-BR").format(code.expiresAt) : "Sem vencimento"}</td><td>{code.active ? "Ativo" : "Revogado"}</td><td>{code.active ? <Button size="sm" variant="danger" loading={pending} onClick={() => revoke(code.id)}>Revogar</Button> : null}</td></tr>)}</tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
