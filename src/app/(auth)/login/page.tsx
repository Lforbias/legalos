import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { LoginForm } from "@/modules/auth/components";
import { getSession } from "@/server/session";
import { safeNext } from "@/server/action-helpers";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; invite?: string }> }) {
  const sp = await searchParams;
  if (await getSession()) redirect(sp.invite ? `/accept-invite?token=${encodeURIComponent(sp.invite)}` : safeNext(sp.next));
  return (
    <>
      {sp.invite ? (
        <Alert tone="info" className="mb-4">
          Entre com a conta do e-mail convidado para aceitar o convite.
        </Alert>
      ) : null}
      <LoginForm next={sp.next ? safeNext(sp.next) : undefined} inviteToken={sp.invite} />
    </>
  );
}
