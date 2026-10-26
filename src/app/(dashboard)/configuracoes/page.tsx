import type { Metadata } from "next";
import { SettingsDirectory } from "@/components/layout/settings-directory";
import { SETTINGS_ITEMS } from "@/config/settings";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";
export const metadata: Metadata = { title: "Configurações" };
export default async function SettingsPage() {
  const { ctx } = await requireTenant();
  return <SettingsDirectory items={SETTINGS_ITEMS.filter(i => !i.permission || can(ctx, i.permission))} />;
}
