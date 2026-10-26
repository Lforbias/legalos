"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/form";

export function SectionSelect({ base, current, tabs, label = "Seção da ficha" }: {
  base: string;
  current: string;
  tabs: { key: string; label: string; count?: number; href?: string }[];
  label?: string;
}) {
  const router = useRouter();
  return <Select aria-label={label} value={current} onChange={(e) => {
    const tab = tabs.find((item) => item.key === e.target.value);
    if (tab) router.push(tab.href ?? `${base}?aba=${tab.key}`);
  }}>{tabs.map((tab) => <option key={tab.key} value={tab.key}>{tab.label}{tab.count != null ? ` (${tab.count})` : ""}</option>)}</Select>;
}
