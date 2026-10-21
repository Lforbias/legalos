import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { todayYmd } from "@/lib/dates/ymd";
import { NoticeForm } from "@/modules/inbox/notice-form";
import { EMPTY_NOTICE } from "@/modules/inbox/schemas";
import { can } from "@/server/context";
import { listCaseOptions } from "@/server/services/case.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Nova intimação" };

export default async function NewNoticePage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "inbox:write")) return <AccessDenied />;
  const cases = can(ctx, "cases:read") ? await listCaseOptions(ctx) : [];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nova intimação" />
      <NoticeForm initial={{ ...EMPTY_NOTICE, receivedAt: todayYmd(ctx.timezone) }} cases={cases} />
    </div>
  );
}
