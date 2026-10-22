import type { Metadata } from "next";
import { Brand } from "@/components/layout/brand";
import { getRequestMeta, requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Acesso bloqueado" };

export default async function BlockedPage() {
  await requireSession();
  const meta = await getRequestMeta();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <Brand />
      <h1 className="text-xl font-semibold">Acesso bloqueado nesta rede</h1>
      <p className="text-sm text-muted">
        O escritório só permite acesso por endereços de internet autorizados. Seu endereço atual é <strong>{meta.ipAddress ?? "desconhecido"}</strong>.
        Peça a quem administra o escritório para autorizá-lo, ou acesse pela rede do escritório.
      </p>
    </main>
  );
}
