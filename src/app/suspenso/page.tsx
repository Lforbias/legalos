import type { Metadata } from "next";
import { Brand } from "@/components/layout/brand";
import { db } from "@/lib/db/client";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Acesso suspenso" };

export default async function SuspendedPage() {
  const session = await requireSession();
  const orgs = await db.membership.findMany({ where: { userId: session.user.id, status: "ACTIVE", organization: { deletedAt: null, suspendedAt: { not: null } } }, select: { organization: { select: { name: true } } } });
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <Brand />
      <h1 className="text-xl font-semibold">Acesso suspenso</h1>
      <p className="text-sm text-muted">
        O acesso {orgs.length === 1 ? `do escritório ${orgs[0]!.organization.name}` : "dos seus escritórios"} está suspenso. Seus dados estão preservados. Fale com o responsável pela plataforma para reativar.
      </p>
    </main>
  );
}
