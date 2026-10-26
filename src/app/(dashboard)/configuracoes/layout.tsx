import { PageHeader } from "@/components/layout/page-header";
import { SettingsNav } from "@/components/layout/settings-nav";
import { SETTINGS_ITEMS } from "@/config/settings";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { ctx } = await requireTenant();
  return <div className="mx-auto max-w-5xl"><PageHeader title="Configurações" description="Encontre os ajustes do escritório, da equipe e das suas ferramentas." /><SettingsNav items={SETTINGS_ITEMS.filter(i => !i.permission || can(ctx, i.permission))} />{children}</div>;
}
