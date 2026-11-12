import { AlertTriangle } from "lucide-react";

export function DataError({ message = "Falha ao carregar dados" }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-xs text-warning">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
