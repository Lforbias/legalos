import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/modules/auth/components";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
