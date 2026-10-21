import { notFound } from "next/navigation";
import { prototypesEnabled } from "@/modules/prototypes/registry";

export default function PrototypesLayout({ children }: { children: React.ReactNode }) {
  if (!prototypesEnabled()) notFound();
  return (
    <div className="mx-auto max-w-7xl">
      <p role="note" className="mb-4 rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-sm text-warning">
        <strong>Protótipo:</strong> só o visual, com dados de exemplo. Nada aqui é salvo, enviado ou conectado a nada de verdade.
      </p>
      {children}
    </div>
  );
}
