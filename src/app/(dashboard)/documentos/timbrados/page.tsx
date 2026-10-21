import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { LetterheadManager } from "@/modules/templates/letterhead-manager";
import { can } from "@/server/context";
import { listLetterheads } from "@/server/services/letterhead.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Timbrados" };

export default async function LetterheadsPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "documents:read")) return <AccessDenied />;
  const rows = await listLetterheads(ctx);
  const manage = can(ctx, "templates:manage");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Timbrados" description="Papel timbrado do escritório para documentos gerados." actions={<Link href="/documentos/modelos" className={buttonVariants({ variant: "secondary" })}>Voltar aos modelos</Link>} />
      <LetterheadManager canManage={manage} rows={rows.map((r) => ({ id: r.id, name: r.name, headerText: r.headerText, footerText: r.footerText, hasLogo: r.logoMime !== null, showPageNumbers: r.showPageNumbers, isDefault: r.isDefault, active: r.active }))} />
    </div>
  );
}
