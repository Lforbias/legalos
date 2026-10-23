import { requireTenant } from "@/server/session";
import { can } from "@/server/context";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { listTaskStages } from "@/server/services/task-stage.service";
import { StageEditor } from "@/modules/tasks/stages-ui";
export const metadata = { title: "Etapas de tarefas" };
export default async function StagesPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "organization:manage") || !can(ctx, "tasks:read")) return <AccessDenied />;
  const stages = await listTaskStages(ctx);
  return <div className="mx-auto max-w-5xl space-y-4"><PageHeader title="Etapas de tarefas" description="Crie etapas como Aguardando protocolo. O status-base define se a tarefa segue aberta, concluída ou cancelada nos indicadores. Desativar preserva tarefas já classificadas." /><StageEditor />{stages.map(s => <StageEditor key={s.id} stage={s} />)}</div>;
}
