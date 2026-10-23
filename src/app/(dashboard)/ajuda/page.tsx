import type { Metadata } from "next";
import { NAV_ITEMS } from "@/config/navigation";
import { HelpCenter } from "@/modules/help/help-center";
import { HELP_GUIDES } from "@/modules/help/guides";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Ajuda" };
export default async function HelpPage() {
  const { ctx } = await requireTenant();
  const visibleKeys = new Set(NAV_ITEMS.filter(n => !n.permission || can(ctx, n.permission)).map(n => n.key));
  const guides = HELP_GUIDES.map(g => ({ ...g, links: g.links.filter(link => visibleKeys.has(link.key)) }));
  return <HelpCenter guides={guides} />;
}
