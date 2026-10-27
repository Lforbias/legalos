import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { registrationMode } from "@/lib/security/registration";
import { requirePlatform } from "@/server/platform";

export const metadata: Metadata = { title: "Administração — cadastros" };
export const dynamic = "force-dynamic";

const labels = {
  open: "Público — sem código",
  code: "Restrito — exige código de acesso",
  closed: "Fechado — somente convites",
} as const;

export default async function AdminRegistrationPage() {
  await requirePlatform();
  const mode = registrationMode();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Política de cadastro"
        description="Consulte a política efetiva de criação de contas e escritórios."
      />
      <Card>
        <CardHeader title="Situação atual" description="Lida diretamente da configuração efetiva do servidor." />
        <CardBody className="space-y-4 text-sm">
          <p>Modo de cadastro: <strong>{labels[mode]}</strong></p>
          {mode === "code" ? (
            <p>Novos clientes precisam informar um código de acesso. O código não é exibido aqui por segurança.</p>
          ) : mode === "closed" ? (
            <p>Novos clientes só podem entrar com um convite válido.</p>
          ) : (
            <p>Visitantes podem criar uma conta sem código de acesso e seguir para o onboarding de um novo escritório.</p>
          )}
          <p>
            A política atual é definida pela variável de ambiente <code>REGISTRATION_MODE</code>.
            Para habilitar o cadastro público, configure <code>REGISTRATION_MODE=open</code> no
            ambiente de produção e reinicie a aplicação. Verifique antes os controles
            de abuso, o onboarding e a separação entre escritórios.
          </p>
          <p>
            Esta página é somente de consulta. Alterar a política pelo painel exige
            uma configuração persistente e um fluxo administrativo auditável; não é
            seguro apresentar um botão que apenas altere a interface sem mudar a
            validação no servidor.
          </p>
          <Link href="/register" className="text-primary-text hover:underline">Ver página de cadastro</Link>
        </CardBody>
      </Card>
    </div>
  );
}
