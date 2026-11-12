"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, ChevronDown, ArrowLeft, X } from "lucide-react";
import * as React from "react";
import { DEPARTMENTS, EVOLUTION_NAV, type Department } from "@/config/evolution-navigation";
import { useLocalStorageValue } from "@/lib/hooks/use-local-storage";
import { cn } from "@/lib/utils";
import { Brand } from "@/components/layout/brand";

function deptOfPath(pathname: string): Department | null {
  if (pathname === "/evolution" || pathname === "/evolution/") return "lobby";
  const match = pathname.match(/^\/evolution\/([^/]+)/);
  if (!match) return null;
  return (match[1] as Department) in DEPARTMENTS ? (match[1] as Department) : null;
}

export function EvolutionSidebar({
  visibleKeys,
  mobileOpen,
  onCloseMobile,
}: {
  visibleKeys: string[];
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();
  const [stored, setStored] = useLocalStorageValue("lo-evo-sidebar", "open");
  const collapsed = stored === "collapsed";
  const toggle = () => setStored(collapsed ? "open" : "collapsed");
  const activeDept = deptOfPath(pathname);

  const [openDept, setOpenDept] = React.useState<Department | null>(null);
  React.useEffect(() => onCloseMobile(), [pathname, onCloseMobile]);

  const departments = (["mesa", "juridico", "controladoria", "atendimento", "comercial", "financeiro", "administracao"] as Department[]);

  const deptNav = (isCollapsed: boolean) => (
    <nav aria-label="Navegação Evolution" className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
      {/* Lobby */}
      <Link
        href="/evolution"
        aria-current={activeDept === "lobby" ? "page" : undefined}
        title={isCollapsed ? "Meu Escritório" : undefined}
        className={cn(
          "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] transition-colors",
          activeDept === "lobby" ? "bg-surface-2 font-medium text-fg before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0.5 before:rounded-full before:bg-primary" : "text-muted hover:bg-surface-2 hover:text-fg",
          isCollapsed && "justify-center px-0",
        )}
      >
        {React.createElement(DEPARTMENTS.lobby.icon, { className: cn("h-[18px] w-[18px] shrink-0", activeDept === "lobby" ? "text-primary-text" : "text-muted group-hover:text-fg"), "aria-hidden": true })}
        {isCollapsed ? <span className="sr-only">Lobby</span> : <span className="truncate">Lobby</span>}
      </Link>

      {/* Minha Mesa */}
      <Link
        href="/evolution/mesa"
        aria-current={activeDept === "mesa" ? "page" : undefined}
        title={isCollapsed ? "Minha Mesa" : undefined}
        className={cn(
          "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] transition-colors",
          activeDept === "mesa" ? "bg-surface-2 font-medium text-fg before:absolute before:bottom-2 before:left-0 before:top-2 before:w-0.5 before:rounded-full before:bg-primary" : "text-muted hover:bg-surface-2 hover:text-fg",
          isCollapsed && "justify-center px-0",
        )}
      >
        {React.createElement(DEPARTMENTS.mesa.icon, { className: cn("h-[18px] w-[18px] shrink-0", activeDept === "mesa" ? "text-primary-text" : "text-muted group-hover:text-fg"), "aria-hidden": true })}
        {isCollapsed ? <span className="sr-only">Minha Mesa</span> : <span className="truncate">Minha Mesa</span>}
      </Link>

      {!isCollapsed && <div className="!mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted/70">Departamentos</div>}

      {departments.map((dept) => {
        const info = DEPARTMENTS[dept];
        const isActive = activeDept === dept;
        const subs = EVOLUTION_NAV.filter((n) => n.department === dept && n.key !== `evo-${dept}` && visibleKeys.includes(n.key));
        const isOpen = !isCollapsed && (openDept === dept || isActive);
        const Icon = info.icon;
        return (
          <div key={dept}>
            <button
              type="button"
              onClick={() => {
                if (isCollapsed) setStored("open");
                setOpenDept(isOpen ? null : dept);
              }}
              title={isCollapsed ? info.name : undefined}
              aria-expanded={isOpen}
              className={cn(
                "group relative flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[13px] transition-colors",
                isActive ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
                isCollapsed && "justify-center px-0",
              )}
            >
              <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: info.color }} aria-hidden />
              </span>
              {isCollapsed ? (
                <span className="sr-only">{info.name}</span>
              ) : (
                <>
                  <span className="flex-1 truncate text-left">{info.name}</span>
                  {subs.length > 0 && <ChevronDown aria-hidden className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />}
                </>
              )}
            </button>

            {isOpen && subs.length > 0 && (
              <div className="ml-4 space-y-0.5 border-l border-border pl-2 pt-1">
                <Link
                  href={`/evolution/${dept}`}
                  className={cn(
                    "flex h-9 items-center gap-3 rounded-lg px-3 text-[12px] transition-colors",
                    pathname === `/evolution/${dept}` ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <Icon className="h-[16px] w-[16px] shrink-0 text-muted" aria-hidden />
                  <span className="truncate">Visão geral</span>
                </Link>
                {subs.map((item) => {
                  const SubIcon = item.icon;
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      className={cn(
                        "flex h-9 items-center gap-3 rounded-lg px-3 text-[12px] transition-colors",
                        active ? "bg-surface-2 font-medium text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
                      )}
                    >
                      <SubIcon className="h-[16px] w-[16px] shrink-0 text-muted" aria-hidden />
                      <span className="truncate">{item.label}</span>
                      {item.existingRoute && (
                        <span className="ml-auto text-[10px] text-muted/60" title="Abre a página atual do Ethos">↗</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-border/80 bg-surface transition-[width] duration-200 md:flex",
          collapsed ? "w-[68px]" : "w-[252px]",
        )}
      >
        <div className={cn("flex h-16 items-center border-b border-border/80 px-4", collapsed ? "justify-center" : "justify-between")}>
          <Link href="/evolution" aria-label="Meu Escritório">
            <Brand compact={collapsed} />
          </Link>
          {!collapsed && <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Evolution</span>}
        </div>

        {deptNav(collapsed)}

        <div className="border-t border-border p-2">
          <Link
            href="/dashboard"
            className="flex h-9 items-center gap-3 rounded-md px-2.5 text-[12px] text-muted hover:bg-surface-2 hover:text-fg"
            title="Voltar para o Ethos"
          >
            <ArrowLeft className="h-[16px] w-[16px]" aria-hidden />
            {!collapsed && <span>Voltar para Ethos</span>}
          </Link>
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
              <Brand />
              <button type="button" aria-label="Fechar menu" onClick={onCloseMobile} className="cursor-pointer rounded-md p-2 text-muted hover:bg-surface-2">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            {deptNav(false)}
            <div className="border-t border-border p-2">
              <Link href="/dashboard" className="flex h-9 items-center gap-3 rounded-md px-2.5 text-[12px] text-muted hover:bg-surface-2 hover:text-fg">
                <ArrowLeft className="h-[16px] w-[16px]" aria-hidden />
                <span>Voltar para Ethos</span>
              </Link>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
