"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import type { ActionState } from "@/lib/validation/common";
import { cancelSubscriptionAction, contractPlanAction, refreshBillingAction, saveBillingProfileAction } from "./actions";

export type BillingPanelData = {
  available: boolean;
  sandbox: boolean;
  plans: { key: string; name: string; description: string | null; priceCents: number | null }[];
  current: { planKey: string; planName: string; status: string } | null;
  automatic: boolean;
  cancelRequestedAt: string | null;
  profile: { name: string; document: string; email: string };
  invoices: { id: string; status: string; valueCents: number; dueDate: string; paidAt: string | null; invoiceUrl: string | null }[];
};

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const INVOICE_STATUS: Record<string, [string, "success" | "warning" | "danger" | "neutral" | "info"]> = {
  PENDING: ["Aguardando pagamento", "info"],
  RECEIVED: ["Paga", "success"],
  CONFIRMED: ["Paga", "success"],
  RECEIVED_IN_CASH: ["Paga", "success"],
  OVERDUE: ["Vencida", "danger"],
  REFUNDED: ["Estornada", "warning"],
  DELETED: ["Cancelada", "neutral"],
};

export function BillingPanel({ data }: { data: BillingPanelData }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);
  const [asking, setAsking] = React.useState(false);
  const [profile, setProfile] = React.useState(data.profile);
  const run = (fn: () => Promise<ActionState>, success: string, after?: () => void) => {
    setError(null);
    setOk(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(Object.values(r.fieldErrors ?? {})[0]?.[0] ?? r.message ?? "Não foi possível concluir.");
      else {
        setOk(success);
        after?.();
      }
      router.refresh();
    });
  };

  if (!data.available) {
    return (
      <div className="space-y-2 text-sm" data-testid="billing-off">
        <p>A cobrança automática ainda não foi ativada nesta instalação. Por enquanto o plano é combinado diretamente com a administração da plataforma.</p>
      </div>
    );
  }
  const profileComplete = !!(data.profile.name && data.profile.document && data.profile.email);
  return (
    <div className="space-y-5 text-sm" data-testid="billing-panel">
      {data.sandbox ? <Alert tone="warning">Modo de teste (sandbox) do provedor de pagamento: nenhuma cobrança real é feita.</Alert> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {ok ? <Alert tone="success">{ok}</Alert> : null}

      <section className="space-y-2">
        <h3 className="font-medium">Dados para cobrança</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <div><label htmlFor="bill-name" className="mb-1 block text-xs text-muted">Nome ou razão social</label><Input id="bill-name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></div>
          <div><label htmlFor="bill-doc" className="mb-1 block text-xs text-muted">CPF ou CNPJ</label><Input id="bill-doc" value={profile.document} onChange={(e) => setProfile({ ...profile, document: e.target.value })} /></div>
          <div><label htmlFor="bill-email" className="mb-1 block text-xs text-muted">E-mail de cobrança</label><Input id="bill-email" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></div>
        </div>
        <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => saveBillingProfileAction(profile), "Dados de cobrança salvos.")} data-testid="billing-save-profile">Salvar dados</Button>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Planos</h3>
        {data.cancelRequestedAt ? <Alert tone="warning">O cancelamento foi solicitado: o acesso pago continua até o fim do período já pago.</Alert> : null}
        <ul className="grid gap-3 md:grid-cols-3">
          {data.plans.map((p) => {
            const isCurrent = data.current?.planKey === p.key && data.automatic;
            return (
              <li key={p.key} className="rounded-md border border-border p-3" data-testid={`plan-${p.key}`}>
                <div className="font-medium">{p.name}</div>
                <div className="text-lg">{p.priceCents == null ? "Sob consulta" : `${brl(p.priceCents)}/mês`}</div>
                {p.description ? <p className="mt-1 text-xs text-muted">{p.description}</p> : null}
                <div className="mt-2">
                  {p.priceCents == null ? (
                    <span className="text-xs text-muted">Fale com a administração.</span>
                  ) : isCurrent ? (
                    <Badge tone="success">Plano atual</Badge>
                  ) : (
                    <Button size="sm" loading={pending} disabled={!profileComplete || !!data.cancelRequestedAt} onClick={() => run(() => contractPlanAction(p.key), data.automatic ? "Plano alterado. As próximas faturas usam o novo valor." : "Assinatura criada. A fatura aparece abaixo; quem paga escolhe Pix, boleto ou cartão.")} data-testid={`contract-${p.key}`}>
                      {data.automatic ? "Trocar para este plano" : "Contratar"}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {!profileComplete ? <p className="text-xs text-muted">Preencha e salve os dados de cobrança para liberar a contratação.</p> : null}
        <p className="text-xs text-muted">Contratar e cancelar exigem a verificação em duas etapas ativa. O pagamento é feito na página segura do provedor: o LegalOS não recebe dados de cartão.</p>
      </section>

      {data.automatic ? (
        <section className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => refreshBillingAction(), "Situação conferida no provedor.")} data-testid="billing-refresh">Atualizar situação</Button>
          {!data.cancelRequestedAt ? (
            asking ? (
              <>
                <Button size="sm" variant="danger" loading={pending} onClick={() => run(() => cancelSubscriptionAction(), "Cancelamento registrado.", () => setAsking(false))} data-testid="billing-cancel-confirm">Confirmar cancelamento</Button>
                <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>Voltar</Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setAsking(true)} data-testid="billing-cancel">Cancelar assinatura…</Button>
            )
          ) : null}
        </section>
      ) : null}

      <section className="space-y-2">
        <h3 className="font-medium">Faturas</h3>
        {data.invoices.length === 0 ? (
          <p className="text-xs text-muted">Nenhuma fatura ainda.</p>
        ) : (
          <table className="w-full text-left text-xs" data-testid="invoice-table">
            <thead className="text-muted"><tr><th className="py-1">Vencimento</th><th>Valor</th><th>Situação</th><th /></tr></thead>
            <tbody>
              {data.invoices.map((i) => {
                const [label, tone] = INVOICE_STATUS[i.status] ?? [i.status, "neutral" as const];
                return (
                  <tr key={i.id} className="border-t border-border">
                    <td className="py-1.5">{i.dueDate.slice(0, 10).split("-").reverse().join("/")}</td>
                    <td>{brl(i.valueCents)}</td>
                    <td><Badge tone={tone}>{label}</Badge></td>
                    <td>{i.invoiceUrl && i.status !== "DELETED" ? <a className="text-primary underline" href={i.invoiceUrl} target="_blank" rel="noopener noreferrer">Abrir fatura</a> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
