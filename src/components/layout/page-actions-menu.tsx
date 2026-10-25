"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Menu } from "@/components/ui/menu";

export function PageActionsMenu({ items, label = "Mais ações" }: {
  items: { href: string; label: string }[];
  label?: string;
}) {
  if (!items.length) return null;
  return (
    <Menu label={label} trigger={<span className="flex h-10 items-center gap-2 px-3 text-sm"><MoreHorizontal className="h-4 w-4" aria-hidden /> Ações</span>}>
      {(close) => items.map((item) => (
        <Link key={item.href} href={item.href} role="menuitem" onClick={close} className="block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none">
          {item.label}
        </Link>
      ))}
    </Menu>
  );
}
