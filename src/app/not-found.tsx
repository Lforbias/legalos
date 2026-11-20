import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <Brand />
      <h1 className="text-xl font-semibold">Página não encontrada</h1>
      <p className="max-w-md text-sm text-muted">O endereço não existe, foi movido ou você não tem acesso a ele.</p>
      <Link href="/" className={buttonVariants({})}>Ir para o início</Link>
    </main>
  );
}
