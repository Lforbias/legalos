import Image from "next/image";
import { product } from "@/config/product";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("brand-assets inline-flex h-8 w-8 shrink-0 items-center justify-center", className)}>
      <Image className="brand-theme-dark h-8 w-8" src="/brand/legalos-ecosystem-dark.svg" width={120} height={120} alt="" />
      <Image className="brand-theme-light h-8 w-8" src="/brand/legalos-ecosystem-light.svg" width={120} height={120} alt="" />
    </span>
  );
}

export function Brand({ compact = false, space }: { compact?: boolean; space?: "func" | "box" | "chat" }) {
  const stem = space ? `legalos-${space}` : "legalos-horizontal";
  const width = space ? 172 : 120;
  return (
    <span className="brand-assets inline-flex items-center">
      {compact ? <BrandMark /> : <>
        <Image className="brand-theme-dark h-auto max-h-9 w-auto max-w-full" src={`/brand/${stem}-dark.svg`} width={width} height={30} alt={`${product.name}${space ? ` ${space === "box" ? "Box" : space === "chat" ? "Chat" : "Func"}` : ""}`} />
        <Image className="brand-theme-light h-auto max-h-9 w-auto max-w-full" src={`/brand/${stem}-light.svg`} width={width} height={30} alt={`${product.name}${space ? ` ${space === "box" ? "Box" : space === "chat" ? "Chat" : "Func"}` : ""}`} />
      </>}
    </span>
  );
}
