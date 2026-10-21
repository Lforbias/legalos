import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { ResetPasswordForm } from "@/modules/auth/components";

export const metadata: Metadata = { title: "Redefinir senha" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <div className="space-y-3">
        <Alert tone="error">Link inválido. Solicite uma nova redefinição.</Alert>
        <Link href="/forgot-password" className="text-sm text-primary-text hover:underline">
          Solicitar novo link
        </Link>
      </div>
    );
  }
  return <ResetPasswordForm token={token} />;
}
