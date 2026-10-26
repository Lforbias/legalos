import Image from "next/image";
import { cn } from "@/lib/utils";

/** Dedicated monochrome identity; shares the LegalOS wordmark, not its product colors. */
export function DesktopBrand({ className }: { className?: string }) {
  return <span className={cn("brand-assets inline-flex w-[180px] shrink-0 items-center", className)}>
    <Image className="brand-theme-dark h-auto w-full" src="/brand/legalos-desktop-dark.svg" width={292} height={80} alt="LegalOS Desktop" />
    <Image className="brand-theme-light h-auto w-full" src="/brand/legalos-desktop-light.svg" width={292} height={80} alt="LegalOS Desktop" />
  </span>;
}
