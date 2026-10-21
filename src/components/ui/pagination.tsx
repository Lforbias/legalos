import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

export function Pagination({ basePath, params, page, pages, total }: { basePath: string; params: Record<string, string | undefined>; page: number; pages: number; total: number }) {
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    if (p > 1) sp.set("pagina", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  return (
    <div className="mt-3 flex items-center justify-between text-xs text-muted">
      <span>
        {total} resultado(s) · página {page} de {pages}
      </span>
      <div className="flex gap-1">
        {page > 1 ? (
          <Link href={href(page - 1)} className="flex h-8 items-center gap-1 rounded-md border border-border px-2.5 hover:bg-surface-2">
            <ChevronLeft className="h-4 w-4" aria-hidden /> Anterior
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={href(page + 1)} className="flex h-8 items-center gap-1 rounded-md border border-border px-2.5 hover:bg-surface-2">
            Próxima <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
