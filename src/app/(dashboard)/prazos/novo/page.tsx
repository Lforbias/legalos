import { boxV3PreviewEnabled } from "@/lib/box-v3-preview";
import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { EMPTY_DEADLINE } from "@/modules/deadlines/schemas";
import { DeadlineForm } from "@/modules/deadlines/deadline-form";
import { can } from "@/server/context";
import { listCaseOptions } from "@/server/services/case.service";
import { listActiveMembers } from "@/server/services/members";
import { resolveSourceNotice } from "@/server/services/notice.service";
import { NotFoundError } from "@/lib/permissions/check";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Novo prazo" };

export default async function NewDeadlinePage({ searchParams }: { searchParams: Promise<{ processo?: string; intimacao?: string; titulo?: string; dias?: string; contagem?: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "deadlines:write") || !can(ctx, "cases:read")) return <AccessDenied />;
  const sp = await searchParams;
  const [members, cases] = await Promise.all([listActiveMembers(ctx), listCaseOptions(ctx)]);
  const notice = /^[0-9a-f-]{36}$/i.test(sp.intimacao ?? "") && (can(ctx, "inbox:read") || (boxV3PreviewEnabled() && ctx.permissions.has("inbox:read"))) ? await resolveSourceNotice(ctx, sp.intimacao, boxV3PreviewEnabled() ? "v3" : "legacy").catch((e) => (e instanceof NotFoundError ? undefined : Promise.reject(e))) : undefined;
  const caseId = cases.some((c) => c.id === (sp.processo ?? notice?.caseId)) ? ((sp.processo ?? notice?.caseId) as string) : "";
  const p = notice?.parsed;
  // sugestão da IA (vem pela URL): só preenche o formulário; o prazo continua como rascunho até a validação humana
  const aiDays = /^\d{1,3}$/.test(sp.dias ?? "") && Number(sp.dias) >= 1 ? sp.dias! : "";
  const aiCount = sp.contagem === "BUSINESS" || sp.contagem === "CALENDAR" ? sp.contagem : "";
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Novo prazo" />
      <DeadlineForm
        noticeId={notice?.id}
        initial={{
          ...EMPTY_DEADLINE,
          caseId,
          responsibleId: ctx.userId,
          title: sp.titulo?.trim() ? sp.titulo.trim().slice(0, 200) : notice ? `Prazo — ${notice.title}`.slice(0, 200) : "",
          startDate: p?.publishedAt ?? "",
          days: aiDays || (p?.suggestedDays ? String(p.suggestedDays) : ""),
          countType: aiDays ? aiCount : p?.suggestedDays ? (p.suggestedCount ?? "") : "",
          notes: notice ? `Origem: intimação "${notice.title}". Dados sugeridos pela leitura do texto — conferir.` : "",
        }}
        members={members}
        cases={cases}
      />
    </div>
  );
}
