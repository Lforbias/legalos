import { Scale } from "lucide-react";
import { product } from "@/config/product";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent text-white", className)}
    >
      <Scale className="h-4 w-4" />
    </span>
  );
}

export function Brand({ compact = false, space }: { compact?: boolean; space?: "func" | "box" | "chat" }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <BrandMark />
      {compact ? null : (
        <span className="text-[15px] font-semibold tracking-tight">
          {product.name}
          {space ? <span className="ml-1.5 rounded bg-primary/15 px-1.5 py-0.5 align-middle text-[11px] font-medium text-primary-text">{space === "box" ? "Box" : space === "chat" ? "Chat" : "Func"}</span> : null}
        </span>
      )}
    </span>
  );
}
