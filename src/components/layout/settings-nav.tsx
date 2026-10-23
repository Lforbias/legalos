"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SETTINGS_GROUPS, type SettingsItem } from "@/config/settings";
export function SettingsNav({ items }: { items: SettingsItem[] }) {
  const pathname = usePathname();
  if (pathname === "/configuracoes") return null;
  const current = items.find(i => i.href === pathname);
  const group = SETTINGS_GROUPS.find(g => g.key === current?.group);
  return <nav aria-label="Configurações" className="mb-5 flex flex-wrap items-center gap-2 text-xs text-muted"><Link href="/configuracoes" className="inline-flex items-center gap-1.5 rounded-md py-2 pr-2 hover:text-fg"><ArrowLeft className="h-3.5 w-3.5" aria-hidden />Todas as configurações</Link>{group ? <><span aria-hidden>/</span><span>{group.title}</span><span aria-hidden>/</span><span aria-current="page" className="text-fg">{current?.label}</span></> : null}</nav>;
}
