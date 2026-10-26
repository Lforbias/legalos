"use client";

import { useRouter } from "next/navigation";
import { Command, Bell, Building2, CheckSquare, Check, CircleHelp, LogOut, Menu as MenuIcon, Plus, Scale, Search, User, UserPlus, Users } from "lucide-react";
import * as React from "react";
import { Menu, MenuItem } from "@/components/ui/menu";
import Link from "next/link";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/modules/notifications/actions";
import { logoutAction } from "@/modules/auth/actions";
import { switchOrganizationAction } from "@/modules/organizations/actions";
import { GlobalSearch } from "./global-search";
import { ThemeToggle } from "./theme-toggle";
import { InstallAppButton } from "@/components/pwa/install-app-button";

type Org = { id: string; name: string; roleName: string };

export function Topbar({
  user,
  organizations,
  activeOrganizationId,
  visibleKeys,
  canInvite,
  canCreateClient,
  canCreateCase,
  canCreateTask,
  notifications,
  onOpenMobile,
}: {
  user: { name: string; email: string };
  organizations: Org[];
  activeOrganizationId: string;
  visibleKeys: string[];
  canInvite: boolean;
  canCreateClient: boolean;
  canCreateCase: boolean;
  canCreateTask: boolean;
  notifications: { unread: number; items: { id: string; title: string; body: string | null; link: string | null; read: boolean }[] };
  onOpenMobile: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  const [mobileSearch, setMobileSearch] = React.useState(false);
  const active = organizations.find((o) => o.id === activeOrganizationId);
  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <>
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b border-border/80 bg-surface/95 px-3 backdrop-blur-xl md:px-5">
      <button type="button" aria-label="Abrir menu" onClick={onOpenMobile} className="cursor-pointer rounded-md p-2 text-muted hover:bg-surface-2 md:hidden">
        <MenuIcon className="h-5 w-5" aria-hidden />
      </button>

      <Menu
        label="Trocar de escritório"
        align="left"
        trigger={
          <span className="flex h-10 max-w-[200px] items-center gap-2 rounded-lg border border-border/80 bg-bg/50 px-3 text-sm transition-colors hover:bg-surface-2">
            <Building2 className="h-4 w-4 shrink-0 text-primary-text" aria-hidden />
            <span className="hidden truncate sm:inline">{active?.name ?? "Escritório"}</span>
          </span>
        }
      >
        {(close) => (
          <>
            <p className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted">Seus escritórios</p>
            {organizations.map((o) => (
              <MenuItem
                key={o.id}
                onClick={() => {
                  close();
                  if (o.id === activeOrganizationId) return;
                  startTransition(async () => {
                    await switchOrganizationAction(o.id);
                    router.push("/");
                    router.refresh();
                  });
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.name}</span>
                  <span className="block text-xs text-muted">{o.roleName}</span>
                </span>
                {o.id === activeOrganizationId ? <Check className="h-4 w-4 text-primary-text" aria-hidden /> : null}
              </MenuItem>
            ))}
            <div className="my-1 border-t border-border" />
            <MenuItem
              onClick={() => {
                close();
                router.push("/onboarding");
              }}
            >
              <Plus className="h-4 w-4" aria-hidden /> Novo escritório
            </MenuItem>
          </>
        )}
      </Menu>

      <div className="hidden flex-1 justify-center px-1 sm:flex">
        <GlobalSearch visibleKeys={visibleKeys} />
      </div>
      <div className="flex-1 sm:hidden" />
      <button
        type="button"
        aria-label="Buscar"
        aria-expanded={mobileSearch}
        onClick={() => setMobileSearch((v) => !v)}
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg sm:hidden"
      >
        <Search className="h-4 w-4" aria-hidden />
      </button>

      {visibleKeys.includes("workspace") ? <Link href="/area-de-trabalho" aria-label="Abrir LegalOS Desktop" title="Abrir LegalOS Desktop" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium transition hover:bg-surface-2"><Command className="h-4 w-4" /><span>Desktop</span></Link> : null}

      <Menu
        label="Criação rápida"
        trigger={
          <span className="flex h-10 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-fg shadow-sm transition hover:bg-primary-hover">
            <Plus className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Criar</span>
          </span>
        }
      >
        {(close) => (
          <>
            <MenuItem
              disabled={!canInvite}
              hint={canInvite ? undefined : "Requer a permissão de convidar usuários."}
              onClick={() => {
                close();
                router.push("/configuracoes/equipe?convidar=1");
              }}
            >
              <UserPlus className="h-4 w-4" aria-hidden /> Convidar usuário
            </MenuItem>
            <MenuItem
              disabled={!canCreateClient}
              hint={canCreateClient ? undefined : "Requer a permissão de criar e editar clientes."}
              onClick={() => {
                close();
                router.push("/clientes/novo");
              }}
            >
              <Users className="h-4 w-4" aria-hidden /> Novo cliente
            </MenuItem>
            <MenuItem
              disabled={!canCreateCase}
              hint={canCreateCase ? undefined : "Requer a permissão de criar e editar processos."}
              onClick={() => {
                close();
                router.push("/processos/novo");
              }}
            >
              <Scale className="h-4 w-4" aria-hidden /> Novo processo
            </MenuItem>
            <MenuItem
              disabled={!canCreateTask}
              hint={canCreateTask ? undefined : "Requer a permissão de criar e editar tarefas."}
              onClick={() => {
                close();
                router.push("/tarefas/nova");
              }}
            >
              <CheckSquare className="h-4 w-4" aria-hidden /> Nova tarefa
            </MenuItem>
          </>
        )}
      </Menu>

      <Menu
        label={notifications.unread > 0 ? `Notificações (${notifications.unread} não lidas)` : "Notificações"}
        trigger={
          <span className="relative flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg">
            <Bell className="h-4 w-4" aria-hidden />
            {notifications.unread > 0 ? (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">{notifications.unread > 99 ? "99+" : notifications.unread}</span>
            ) : null}
          </span>
        }
        panelClassName="w-80"
      >
        {(close) =>
          notifications.items.length === 0 ? (
            <div className="px-3 py-4 text-sm">
              <p className="font-medium">Sem notificações</p>
              <p className="mt-1 text-xs text-muted">Avisos de prazos, tarefas e atribuições aparecem aqui.</p>
              <Link href="/notificacoes" onClick={close} className="mt-2 inline-block text-xs text-primary-text hover:underline">Abrir central</Link>
            </div>
          ) : (
            <div>
              <ul className="max-h-80 overflow-y-auto">
                {notifications.items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className="flex w-full cursor-pointer flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-surface-2"
                      onClick={() => {
                        close();
                        startTransition(async () => {
                          if (!n.read) await markNotificationReadAction(n.id);
                          router.push(n.link ?? "/notificacoes");
                          router.refresh();
                        });
                      }}
                    >
                      <span className={n.read ? "text-muted" : "font-medium"}>{n.title}</span>
                      {n.body ? <span className="line-clamp-2 text-xs text-muted">{n.body}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs">
                <Link href="/notificacoes" onClick={close} className="text-primary-text hover:underline">Ver todas</Link>
                {notifications.unread > 0 ? (
                  <button
                    type="button"
                    className="cursor-pointer text-muted hover:text-fg"
                    onClick={() => {
                      close();
                      startTransition(async () => {
                        await markAllNotificationsReadAction();
                        router.refresh();
                      });
                    }}
                  >
                    Marcar todas como lidas
                  </button>
                ) : null}
              </div>
            </div>
          )
        }
      </Menu>

      <Menu
        label="Ajuda e suporte"
        trigger={
          <span className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg">
            <CircleHelp className="h-4 w-4" aria-hidden />
          </span>
        }
      >
        {(close) => (
          <>
            <MenuItem
              onClick={() => {
                close();
                router.push("/ajuda");
              }}
            >
              Central de ajuda
            </MenuItem>
            <MenuItem onClick={() => { close(); router.push("/modulos/ajuda"); }}>
              Roadmap e status dos módulos
            </MenuItem>
          </>
        )}
      </Menu>

      <InstallAppButton />
      <ThemeToggle />

      <Menu
        label="Menu do usuário"
        trigger={
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xs font-semibold text-primary-text">{initials || "?"}</span>
        }
      >
        {(close) => (
          <>
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
            <div className="my-1 border-t border-border" />
            <MenuItem
              onClick={() => {
                close();
                router.push("/conta");
              }}
            >
              <User className="h-4 w-4" aria-hidden /> Minha conta
            </MenuItem>
            <form action={logoutAction}>
              <button type="submit" role="menuitem" className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-surface-2">
                <LogOut className="h-4 w-4" aria-hidden /> Sair
              </button>
            </form>
          </>
        )}
      </Menu>
    </header>
    {mobileSearch ? (
      <div className="border-b border-border bg-surface px-3 py-2 sm:hidden">
        <GlobalSearch visibleKeys={visibleKeys} idSuffix="-mobile" />
      </div>
    ) : null}
    </>
  );
}

