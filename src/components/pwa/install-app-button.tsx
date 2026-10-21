"use client";

import { Download, X } from "lucide-react";
import * as React from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** Botão "Instalar app": aparece só quando o navegador permite instalar (Android/Chrome/Edge) ou no iPhone/iPad (instruções). */
export function InstallAppButton() {
  const [evt, setEvt] = React.useState<InstallEvent | null>(null);
  // iPhone/iPad no Safari (fora do app instalado): não há evento de instalação, só instruções.
  const ios = React.useSyncExternalStore(
    () => () => {},
    () => !isStandalone() && isIos(),
    () => false,
  );
  const [help, setHelp] = React.useState(false);

  React.useEffect(() => {
    if (isStandalone()) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
    };
    const onInstalled = () => setEvt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!evt && !ios) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Instalar o aplicativo"
        title="Instalar o aplicativo"
        onClick={async () => {
          if (evt) {
            await evt.prompt();
            await evt.userChoice;
            setEvt(null);
          } else setHelp(true);
        }}
        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm text-muted hover:bg-surface-2 hover:text-fg"
      >
        <Download className="h-4 w-4" aria-hidden />
        <span className="hidden lg:inline">Instalar app</span>
      </button>
      {help ? (
        <div role="dialog" aria-label="Como instalar no iPhone ou iPad" className="fixed inset-x-3 bottom-3 z-50 rounded-lg border border-border bg-surface p-4 text-sm shadow-lg sm:left-auto sm:w-80">
          <button type="button" aria-label="Fechar" onClick={() => setHelp(false)} className="absolute right-2 top-2 cursor-pointer rounded p-1 text-muted hover:bg-surface-2">
            <X className="h-4 w-4" aria-hidden />
          </button>
          <p className="font-medium">Instalar no iPhone ou iPad</p>
          <p className="mt-1 text-muted">No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.</p>
        </div>
      ) : null}
    </>
  );
}
