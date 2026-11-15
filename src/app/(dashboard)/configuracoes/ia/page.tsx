import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Configuração de IA indisponível" };
export default function AiSettingsPage() {
  return <div className="max-w-3xl space-y-5">
    <div><h2 className="text-lg font-semibold">Configuração de IA indisponível</h2><p className="mt-1 text-sm text-muted">A configuração de provedor e os recursos associados à RUTE foram desativados.</p></div>
    <Alert tone="info">As chaves salvas permanecem protegidas e não são exibidas. Se o escritório precisar reativar esses recursos no futuro, a administração poderá fazer isso após uma revisão.</Alert>
    <Link href="/configuracoes" className={buttonVariants({ variant: "secondary" })}>Voltar às configurações</Link>
  </div>;
}
