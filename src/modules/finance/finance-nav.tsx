import Link from "next/link";
import { cn } from "@/lib/utils";

const ITEMS = [
  { key: "visao", label: "Visão geral", href: "/financeiro" },
  { key: "anual", label: "Fluxo anual", href: "/financeiro/anual" },
  { key: "faturas", label: "Faturas", href: "/financeiro/faturas" },
  { key: "lancamentos", label: "Lançamentos", href: "/financeiro/lancamentos" },
  { key: "cadastros", label: "Cadastros", href: "/financeiro/cadastros" },
] as const;

export function FinanceNav({ current }: { current: (typeof ITEMS)[number]["key"] }) {
  return (
    <nav aria-label="Financeiro" className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
      {ITEMS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors", t.key === current ? "border-primary font-medium text-fg" : "border-transparent text-muted hover:text-fg")}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
