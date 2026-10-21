import { Brand } from "@/components/layout/brand";
import { product } from "@/config/product";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <Brand />
        <p className="max-w-xs text-xs text-muted">{product.tagline}</p>
      </div>
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-xl shadow-black/20">{children}</div>
    </main>
  );
}
