import { redirect } from "next/navigation";
import DashboardLayout from "@/app/(dashboard)/layout";
import { evolutionEnabled } from "@/lib/evolution";

export default function EvolutionLayout({ children }: { children: React.ReactNode }) {
  if (!evolutionEnabled()) redirect("/dashboard");
  return <DashboardLayout>{children}</DashboardLayout>;
}
