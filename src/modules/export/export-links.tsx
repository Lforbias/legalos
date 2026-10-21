import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Botão "Exportar" das listas: Excel (.xlsx) e, menor, CSV. A permissão é conferida no servidor ao baixar. */
export function ExportLinks({ kind }: { kind: "clientes" | "processos" | "tarefas" | "lancamentos" }) {
  return (
    <span className="inline-flex items-center gap-1" data-testid={`export-${kind}`}>
      <a href={`/api/export?tipo=${kind}`} className={cn(buttonVariants({ variant: "secondary" }), "gap-2")}>
        <Download className="h-4 w-4" aria-hidden /> Exportar Excel
      </a>
      <a href={`/api/export?tipo=${kind}&formato=csv`} className="px-1 text-xs text-muted underline" aria-label={`Exportar ${kind} em CSV`}>CSV</a>
    </span>
  );
}
