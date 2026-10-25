"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/form";

export function SectionSelect({ base, current, tabs }: {
  base: string;
  current: string;
  tabs: { key: string; label: string; count?: number }[];
}) {
  const router = useRouter();
  return <Select aria-label="Seção da ficha" value={current} onChange={(e) => router.push(`${base}?aba=${e.target.value}`)}>{tabs.map((tab) => <option key={tab.key} value={tab.key}>{tab.label}{tab.count != null ? ` (${tab.count})` : ""}</option>)}</Select>;
}
