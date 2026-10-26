import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function RecordBackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="mb-4 inline-flex items-center gap-1.5 rounded text-xs text-muted transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><ArrowLeft className="h-3.5 w-3.5" aria-hidden />{children}</Link>;
}
