import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getOfficeSetup } from "@/server/services/office-setup.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Implantação do escritório" };
const stages = [
  { id: 1, title: "Etapa 1 — Operação processual", description: "Carteira, prazos, tarefas e acesso da equipe." },
  { id: 2, title: "Etapa 2 — Módulos conectados", description: "Financeiro, relacionamento, documentos, automações e RUTE." },
  { id: 3, title: "Etapa 3 — Adoção e acompanhamento", description: "Portal, migração, relatórios, celular e treinamento." },
] as const;
const status = { CONFIGURED: { label: "Configurado", tone: "success" }, PENDING: { label: "Pendente", tone: "warning" }, REVIEW: { label: "Conferir com a equipe", tone: "neutral" } } as const;

export default async function OfficeSetupPage() {
  const { ctx } = await requireTenant();
  const steps = await getOfficeSetup(ctx);
  return <div className="space-y-6">
    <div><h1 className="text-xl font-semibold">Implantação do escritório</h1><p className="mt-2 text-sm leading-6 text-muted">Acompanhe a configuração das três etapas. A lista é atualizada a partir dos cadastros do escritório e dos módulos que seu perfil pode consultar. Uma configuração salva ainda precisa de conferência com a equipe e, nas integrações, de validação com o serviço real.</p></div>
    {stages.map(stage => <Card key={stage.id}>
      <CardHeader title={stage.title} description={stage.description} />
      <CardBody><ul className="space-y-4">{steps.filter(step => step.stage === stage.id).map(step => <li key={step.id} className="rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">{step.title}</h2><Badge tone={status[step.status].tone}>{status[step.status].label}</Badge></div>
        <p className="mt-2 text-sm leading-6 text-muted">{step.description}</p>
        <Link href={step.href} className="mt-3 inline-block text-sm text-primary-text underline underline-offset-4">Abrir {step.title.toLowerCase()}</Link>
      </li>)}</ul></CardBody>
    </Card>)}
    <p className="text-xs leading-5 text-muted">Backups e restauração são acompanhados pela equipe responsável pelo servidor. Esta lista não atesta a integridade dos backups nem substitui uma restauração de teste.</p>
  </div>;
}
