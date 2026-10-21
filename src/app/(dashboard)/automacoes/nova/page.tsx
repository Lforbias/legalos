import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { RuleForm } from "@/modules/workflows/rule-form";
import { EMPTY_RULE } from "@/modules/workflows/schemas";
import { can } from "@/server/context";
import { listActiveMembers } from "@/server/services/members";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Nova regra" };

export default async function NewRulePage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "workflows:manage")) return <AccessDenied />;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nova regra de automação" />
      <RuleForm initial={EMPTY_RULE} members={await listActiveMembers(ctx)} />
    </div>
  );
}
