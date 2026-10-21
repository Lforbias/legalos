"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import * as React from "react";
import { NAV_ITEMS, SPACES, spaceOfPath, type Space } from "@/config/navigation";
import { useLocalStorageValue } from "@/lib/hooks/use-local-storage";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";

function isActive(pathname: string, href: string, key: string) {
  if (key === "overview") return pathname === "/";
  if (key === "box-overview") return pathname === "/box";
  if (key === "whatsapp") return pathname === "/atendimento";
  if (key === "settings") return pathname.startsWith("/configuracoes") || pathname.startsWith("/conta");
  return pathname === href || pathname.startsWith(`${href}/`) || pathname === `/modulos/${key}`;
}

export function Sidebar({
  visibleKeys,
  boxBadge,
  chatBadge,
  mobileOpen,
  onCloseMobile,
}: {
  visibleKeys: string[];
  /** Intimações novas aguardando distribuição (aparece no alternador do Box). */
  boxBadge: number;
  /** Mensagens de WhatsApp não lidas (aparece no alternador do Chat). */
  chatBadge: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();
  const [stored, setStored] = useLocalStorageValue("lo-sidebar", "open");
  const collapsed = stored === "collapsed";
  React.useEffect(() => onCloseMobile(), [pathname, onCloseMobile]);

  const toggle = () => setStored(collapsed ? "open" : "collapsed");

  const space = spaceOfPath(pathname);
  const spaces = (["func", "box", "chat"] as Space[]).filter((sp) => sp === "func" || NAV_ITEMS.some((n) => n.space === sp && visibleKeys.includes(n.key)));
  const items = NAV_ITEMS.filter((n) => visibleKeys.includes(n.key) && (n.space === space || n.space === "both"));

  const switcher = (isCollapsed: boolean) =>
    spaces.length > 1 ? (
      <div role="group" aria-label="Alternar entre Func, Box e Chat" className={cn("mx-2 mt-2 grid gap-1 rounded-lg border border-border bg-surface-2 p-1", isCollapsed ? "grid-cols-1" : spaces.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {spaces.map((sp) => {
          const on = sp === space;
          return (
            <Link
              key={sp}
              href={SPACES[sp].home}
              aria-current={on ? "true" : undefined}
              title={SPACES[sp].name}
              data-testid={`space-${sp}`}
              className={cn("relative flex h-8 items-center justify-center rounded-md text-[12px] font-medium transition-colors", on ? "bg-primary text-primary-fg" : "text-muted hover:bg-surface-3 hover:text-fg")}
            >
              {isCollapsed ? SPACES[sp].short[0] : SPACES[sp].short}
              <span className="sr-only">{`LegalOS ${SPACES[sp].short}`}</span>
              {sp === "chat" && chatBadge > 0 ? <span className="ml-1.5 rounded-full bg-warning px-1.5 text-[10px] font-semibold leading-4 text-black" aria-label={`${chatBadge} mensagens não lidas`}>{chatBadge > 99 ? "99+" : chatBadge}</span> : null}
              {sp === "box" && boxBadge > 0 ? <span className="ml-1.5 rounded-full bg-warning px-1.5 text-[10px] font-semibold leading-4 text-black" aria-label={`${boxBadge} intimações novas`}>{boxBadge > 99 ? "99+" : boxBadge}</span> : null}
            </Link>
          );
        })}
      </div>
    ) : null;

  const nav = (isCollapsed: boolean) => (
    <nav aria-label={`Navegação ${SPACES[space].short}`} className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
      {items.map((item) => {
        const active = isActive(pathname, item.href, item.key);
        const Icon = item.icon;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            title={isCollapsed ? item.label : undefined}
            className={cn(
              "group flex h-9 items-center gap-3 rounded-md px-2.5 text-[13px] transition-colors",
              active ? "bg-primary/15 text-primary-text" : "text-muted hover:bg-surface-2 hover:text-fg",
              isCollapsed && "justify-center px-0",
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
            {isCollapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
            {!isCollapsed && !item.implemented ? (
              <span className="ml-auto rounded bg-surface-3 px-1.5 text-[10px] text-muted" title={`Disponível na Fase ${item.phase}`}>
                F{item.phase}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-150 md:flex",
          collapsed ? "w-[60px]" : "w-64",
        )}
      >
        <div className={cn("flex h-14 items-center border-b border-border px-3", collapsed ? "justify-center" : "justify-between")}>
          <Link href={SPACES[space].home} aria-label={`Início do ${SPACES[space].name}`}>
            <Brand compact={collapsed} space={space} />
          </Link>
        </div>
        {switcher(collapsed)}
        {nav(collapsed)}
        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
            className={cn("flex h-9 w-full cursor-pointer items-center gap-3 rounded-md px-2.5 text-[13px] text-muted hover:bg-surface-2 hover:text-fg", collapsed && "justify-center px-0")}
          >
            {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden /> : <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden />}
            {collapsed ? null : <span>Recolher</span>}
          </button>
        </div>
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Fechar menu" className="absolute inset-0 cursor-default bg-black/60" onClick={onCloseMobile} />
          <aside className="lo-pop absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border bg-surface">
            <div className="flex h-14 items-center justify-between border-b border-border px-3">
              <Brand space={space} />
              <button type="button" aria-label="Fechar menu" onClick={onCloseMobile} className="cursor-pointer rounded-md p-2 text-muted hover:bg-surface-2">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {switcher(false)}
            {nav(false)}
          </aside>
        </div>
      ) : null}
    </>
  );
}
