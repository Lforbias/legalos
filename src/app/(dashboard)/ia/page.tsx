import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { AskPanel } from "@/modules/ai/ask-panel";
import { EnableToggle } from "@/modules/ai/enable-toggle";
import { DraftPanel, JurisPanel } from "@/modules/ai/tools-ui";
import { can } from "@/server/context";
import { aiStatus } from "@/server/services/ai.service";
import { listCaseOptions } from "@/server/services/case.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Inteligência artificial" };

export default async function AiPage({ searchParams }: { searchParams: Promise<{ processo?: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "ai:use")) return <AccessDenied />;
  const sp = await searchParams;
  const [status, caseRows] = await Promise.all([aiStatus(ctx), can(ctx, "cases:read") ? listCaseOptions(ctx) : Promise.resolve([])]);
  const cases = caseRows.map((c) => ({ id: c.id, label: c.number ? `${c.title} (${c.number})` : c.title }));
  const disabledReason = !status.providerConfigured
    ? "O assistente ainda não foi configurado neste sistema: falta a chave do provedor (variável ANTHROPIC_API_KEY). Nenhuma resposta é simulada."
    : !status.orgEnabled
      ? "A IA está desligada neste escritório. Quem administra as integrações pode ligá-la abaixo."
      : null;
  const pct = Math.min(100, Math.round((status.usedThisMonth / status.monthlyLimit) * 100));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Assistente de IA" description="Perguntas sobre um processo, respondidas só com os dados que você já pode ver no LegalOS, sempre com fontes." />
      <div className="space-y-4">
        <Alert tone="info">
          Ao perguntar, os dados do processo escolhido (partes, andamentos, prazos, tarefas, intimações, nomes de documentos e o início do texto extraído de até 5 documentos) são enviados ao provedor de IA. CPF/CNPJ e e-mails são ocultados e o cadastro de clientes não é enviado. A pergunta e a resposta não ficam gravadas; só o consumo.
        </Alert>
        <Card>
          <CardHeader title="Situação" action={status.providerConfigured && status.orgEnabled ? <Badge tone="success">Ativa</Badge> : <Badge tone="warning">Desligada</Badge>} />
          <CardBody className="space-y-2 text-sm">
            <p>Modelo: {status.model ?? "—"}</p>
            <p data-testid="ai-usage">Uso neste mês: {status.usedThisMonth.toLocaleString("pt-BR")} de {status.monthlyLimit.toLocaleString("pt-BR")} tokens ({pct}%)</p>
            {can(ctx, "integrations:manage") && status.providerConfigured ? <EnableToggle enabled={status.orgEnabled} /> : null}
          </CardBody>
        </Card>
        <AskPanel cases={cases} initialCaseId={sp.processo ?? ""} disabledReason={disabledReason} />
        {!disabledReason ? (
          <>
            <Card><CardHeader title="Pesquisa de jurisprudência (mapa de pesquisa)" description="Teses, termos de busca e o que conferir. Não afirma precedentes." /><CardBody><JurisPanel cases={cases} /></CardBody></Card>
            {can(ctx, "petitions:write") ? <Card><CardHeader title="Minuta de peça" description="Rascunho para o advogado revisar. Nada é protocolado." /><CardBody><DraftPanel cases={cases} /></CardBody></Card> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
