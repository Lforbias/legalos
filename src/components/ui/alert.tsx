import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  error: { cls: "bg-danger-bg text-danger border-danger/40", Icon: AlertCircle },
  success: { cls: "bg-success-bg text-success border-success/40", Icon: CheckCircle2 },
  warning: { cls: "bg-warning-bg text-warning border-warning/40", Icon: TriangleAlert },
  info: { cls: "bg-info-bg text-primary-text border-primary/30", Icon: Info },
} as const;

export function Alert({ tone = "info", children, className }: { tone?: keyof typeof tones; children: React.ReactNode; className?: string }) {
  const { cls, Icon } = tones[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-sm", cls, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
