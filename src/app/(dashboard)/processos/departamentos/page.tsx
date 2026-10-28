import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { DepartmentName } from "@/modules/cases/department-name";
import { can } from "@/server/context";
import { listCaseDepartments } from "@/server/services/case.service";
import { requireTenant } from "@/server/session";

export const metadata = { title: "Departamentos" };
export default async function DepartmentsPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "organization:manage") || !can(ctx, "cases:read")) return <AccessDenied />;
  const rows = await listCaseDepartments(ctx);
  return <div className="mx-auto max-w-3xl space-y-4">
    <Link href="/processos" className="text-sm text-muted hover:underline">Voltar para processos e casos</Link>
    <PageHeader title="Departamentos" description="Ao salvar um caso com encaminhamento automático, a área jurídica define seu departamento. Você pode personalizar o nome aqui ou escolher outro departamento no cadastro." />
    <p className="text-sm text-muted">Departamentos organizam a carteira. Responsáveis e permissões de sigilo continuam sendo definidos em cada caso; esta etapa ainda não distribui tarefas entre a equipe automaticamente.</p>
    {rows.length ? rows.map(d => <DepartmentName key={d.id} {...d} />) : <p className="text-sm text-muted">Salve o primeiro caso com uma área jurídica para criar seu departamento.</p>}
  </div>;
}
