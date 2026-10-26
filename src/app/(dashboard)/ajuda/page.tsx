import type { Metadata } from "next";
import { SETTINGS_ITEMS } from "@/config/settings";
import { NAV_ITEMS } from "@/config/navigation";
import { HelpCenter } from "@/modules/help/help-center";
import { HELP_GUIDES } from "@/modules/help/guides";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Ajuda" };
export default async function HelpPage() {
  const { ctx } = await requireTenant();
  const visibleKeys = new Set(NAV_ITEMS.filter(n => !n.permission || can(ctx, n.permission)).map(n => n.key));
  const guides = HELP_GUIDES.map(g => ({ ...g, links: g.links.filter(link => { const permission = link.permission ?? SETTINGS_ITEMS.find(item => item.href === link.href)?.permission; return visibleKeys.has(link.key) && (!permission || can(ctx, permission)); }) }));
  return <HelpCenter guides={guides} />;
}
