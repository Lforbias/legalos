import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { GiftCodeAdmin } from "@/modules/welcome/gift-code-admin";
import { requirePlatform } from "@/server/platform";
import { listGiftCodes } from "@/server/services/gift-code.service";

export const metadata: Metadata = { title: "Administração — códigos-presente" };
export const dynamic = "force-dynamic";

export default async function GiftCodesPage() {
  const { pc } = await requirePlatform();
  const codes = await listGiftCodes(pc);
  return (
    <div className="space-y-4">
      <PageHeader title="Códigos-presente" description="Crie benefícios de acesso com campanha, validade, limite de usos e trilha de auditoria." />
      <GiftCodeAdmin initialCodes={codes} />
    </div>
  );
}
