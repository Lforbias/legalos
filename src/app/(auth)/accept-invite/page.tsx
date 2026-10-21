import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { AcceptInvitePanel } from "@/modules/auth/components";
import { previewInvitation } from "@/server/services/invitation.service";
import { getSession } from "@/server/session";

export const metadata: Metadata = { title: "Aceitar convite" };

export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const invite = token ? await previewInvitation(token) : null;
  if (!token || !invite) {
    return (
      <div className="space-y-3">
        <Alert tone="error">Convite inválido, expirado ou já utilizado. Peça um novo convite ao administrador do escritório.</Alert>
        <Link href="/login" className="text-sm text-primary-text hover:underline">
          Ir para o login
        </Link>
      </div>
    );
  }
  const session = await getSession();
  if (!session) {
    const q = `invite=${encodeURIComponent(token)}`;
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Convite para {invite.organizationName}</h1>
        <p className="text-sm text-muted">
          Convite enviado para <strong className="text-fg">{invite.email}</strong> com o perfil <strong className="text-fg">{invite.roleName}</strong>.
        </p>
        <Link href={invite.hasAccount ? `/login?${q}` : `/register?${q}`} className={buttonVariants({ className: "w-full" })}>
          {invite.hasAccount ? "Entrar para aceitar" : "Criar conta para aceitar"}
        </Link>
        {!invite.hasAccount ? (
          <Link href={`/login?${q}`} className="block text-center text-xs text-primary-text hover:underline">
            Já tenho conta
          </Link>
        ) : null}
      </div>
    );
  }
  if (session.user.email !== invite.email) {
    return (
      <Alert tone="warning">
        Este convite foi enviado para <strong>{invite.email}</strong>, mas você está conectado como <strong>{session.user.email}</strong>. Saia e entre com a conta
        convidada.
      </Alert>
    );
  }
  return <AcceptInvitePanel token={token} organizationName={invite.organizationName} roleName={invite.roleName} />;
}
