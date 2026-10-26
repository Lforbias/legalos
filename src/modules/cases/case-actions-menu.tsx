"use client";

import Link from "next/link";
import { Download, MoreHorizontal, StickyNote, Upload, Users } from "lucide-react";
import { Menu } from "@/components/ui/menu";

const itemClass = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-fg transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none";

export function CaseActionsMenu({ canWrite }: { canWrite: boolean }) {
  return (
    <Menu
      label="Mais ações de processos"
      trigger={<span className="flex h-9 items-center gap-2 px-3 text-sm"><MoreHorizontal className="h-4 w-4" aria-hidden /> Ações</span>}
    >
      {(close) => (
        <>
          <Link href="/partes" role="menuitem" onClick={close} className={itemClass}>
            <Users className="h-4 w-4 text-muted" aria-hidden /> Cadastro de partes
          </Link>
          {canWrite ? (
            <>
              <Link href="/processos/importar" role="menuitem" onClick={close} className={itemClass}>
                <Upload className="h-4 w-4 text-muted" aria-hidden /> Importar por número
              </Link>
              <Link href="/processos/nota-em-lote" role="menuitem" onClick={close} className={itemClass}>
                <StickyNote className="h-4 w-4 text-muted" aria-hidden /> Nota em lote
              </Link>
            </>
          ) : null}
          <div role="separator" className="my-1 border-t border-border" />
          <a href="/api/export?tipo=processos" role="menuitem" onClick={close} className={itemClass}>
            <Download className="h-4 w-4 text-muted" aria-hidden /> Exportar Excel
          </a>
          <a href="/api/export?tipo=processos&formato=csv" role="menuitem" onClick={close} className={itemClass}>
            <Download className="h-4 w-4 text-muted" aria-hidden /> Exportar CSV
          </a>
        </>
      )}
    </Menu>
  );
}
