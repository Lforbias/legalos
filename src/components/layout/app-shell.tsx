"use client";

import { usePathname } from "next/navigation";
import * as React from "react";
import { spaceOfPath } from "@/config/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell(props: {
  user: { name: string; email: string };
  organizations: { id: string; name: string; roleName: string }[];
  activeOrganizationId: string;
  visibleKeys: string[];
  boxBadge: number;
  chatBadge: number;
  canInvite: boolean;
  canCreateClient: boolean;
  canCreateCase: boolean;
  canCreateTask: boolean;
  notifications: { unread: number; items: { id: string; title: string; body: string | null; link: string | null; read: boolean }[] };
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const space = spaceOfPath(pathname);
  const fullBleed = pathname === "/atendimento"; // o Chat ocupa a tela inteira, como um aplicativo de mensagens
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const close = React.useCallback(() => setMobileOpen(false), []);
  return (
    <div className="flex h-dvh overflow-hidden" data-space={space}>
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-fg">
        Pular para o conteúdo
      </a>
      <Sidebar visibleKeys={props.visibleKeys} boxBadge={props.boxBadge} chatBadge={props.chatBadge} mobileOpen={mobileOpen} onCloseMobile={close} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={props.user}
          organizations={props.organizations}
          activeOrganizationId={props.activeOrganizationId}
          visibleKeys={props.visibleKeys}
          canInvite={props.canInvite}
          canCreateClient={props.canCreateClient}
          canCreateCase={props.canCreateCase}
          canCreateTask={props.canCreateTask}
          notifications={props.notifications}
          onOpenMobile={() => setMobileOpen(true)}
        />
        {props.banner}
        <main id="conteudo" tabIndex={-1} className={fullBleed ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-y-auto p-4 md:p-6"}>
          {props.children}
        </main>
      </div>
    </div>
  );
}
