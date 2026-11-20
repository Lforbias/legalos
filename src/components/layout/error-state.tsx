"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/** Tela padrão de erro inesperado (usada pelos error.tsx). Nunca mostra detalhes técnicos; mostra só o código para o suporte. */
export function ErrorState({ error, retry, homeHref = "/dashboard" }: { error: unknown; retry: () => void; homeHref?: string }) {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest?: unknown }).digest ?? "") : "";
  return (
    <div role="alert" className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Algo deu errado nesta tela</h1>
      <p className="text-sm text-muted">
        Não foi possível carregar o conteúdo agora. Seus dados estão preservados. Tente de novo; se continuar, avise o suporte
        {digest ? <> informando o código <code className="font-mono text-fg">{digest}</code></> : null}.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => retry()} className={buttonVariants({})}>Tentar de novo</button>
        <Link href={homeHref} className={buttonVariants({ variant: "secondary" })}>Voltar ao início</Link>
      </div>
    </div>
  );
}
