import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { NotFoundError } from "@/lib/permissions/check";
import { uuidSchema } from "@/lib/validation/common";
import { SessionView } from "@/modules/copiloto/copiloto-ui";
import { can } from "@/server/context";
import { listActiveMembers } from "@/server/services/members";
import { copilotAvailability, getSession } from "@/server/services/service-session.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Atendimento" };

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "ai:use")) return <AccessDenied />;
  const parsed = uuidSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const s = await getSession(ctx, parsed.data).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!s) notFound();
  const av = await copilotAvailability(ctx);
  const canTasks = can(ctx, "tasks:write");
  const members = canTasks ? await listActiveMembers(ctx) : [];
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title={s.title} description="Revisão do atendimento" />
      <Link href="/copiloto" className="text-sm text-primary-text hover:underline">← Atendimentos</Link>
      <Card>
        <CardHeader title="Transcrição" />
        <CardBody><p className="max-h-72 overflow-auto whitespace-pre-wrap text-sm">{s.transcript}</p></CardBody>
      </Card>
      <Card>
        <CardHeader title="Análise do copiloto" />
        <CardBody><SessionView key={`${s.status}:${s.summary?.length ?? 0}`} id={s.id} status={s.status} summary={s.summary} actions={s.actions} tasks={s.tasks} documents={s.documents} canAi={av.ok} aiReason={av.reason} canTasks={canTasks} members={members.map((m) => ({ id: m.id, name: m.name }))} /></CardBody>
      </Card>
    </div>
  );
}
