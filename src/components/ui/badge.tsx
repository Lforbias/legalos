import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badge = cva("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border", {
  variants: {
    tone: {
      neutral: "bg-surface-2 text-muted border-border",
      info: "bg-info-bg text-primary-text border-primary/30",
      success: "bg-success-bg text-success border-success/30",
      warning: "bg-warning-bg text-warning border-warning/30",
      danger: "bg-danger-bg text-danger border-danger/30",
      accent: "bg-surface-2 text-accent-text border-accent/40",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ tone, className, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}
