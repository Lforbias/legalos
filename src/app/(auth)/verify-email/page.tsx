import type { Metadata } from "next";
import { Alert } from "@/components/ui/alert";
import { VerifyEmailPanel } from "@/modules/auth/components";

export const metadata: Metadata = { title: "Confirmar e-mail" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) return <Alert tone="error">Link de verificação inválido.</Alert>;
  // A confirmação exige um clique (POST via Server Action) para que pré-visualizadores de links não consumam o token.
  return <VerifyEmailPanel token={token} />;
}
