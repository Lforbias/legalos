import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { registrationMode } from "@/lib/security/registration";
import { RegisterForm } from "@/modules/auth/components";
import { previewInvitation } from "@/server/services/invitation.service";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Criar conta" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const sp = await searchParams;
  if (await getSession()) redirect(sp.invite ? `/accept-invite?token=${encodeURIComponent(sp.invite)}` : "/");
  const invite = sp.invite ? await previewInvitation(sp.invite) : null;
  const mode = registrationMode();
  if (mode === "closed" && !invite) {
    return (
      <div className="space-y-3" data-testid="register-closed">
        <h1 className="text-lg font-semibold">Cadastro fechado</h1>
        <p className="text-sm text-muted">Novos escritórios só entram por convite. Se você faz parte de uma equipe, peça o convite à administração; se já tem conta, entre.</p>
        <Link href="/login" className="text-sm text-primary-text hover:underline">Entrar</Link>
      </div>
    );
  }
  return <RegisterForm inviteToken={invite ? sp.invite : undefined} inviteEmail={invite?.email} needsCode={mode === "code" && !invite} />;
}
