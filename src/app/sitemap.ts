import type { MetadataRoute } from "next";
import { sql } from "@/server/audience/store";
import { publicUrl } from "@/lib/audience/policy";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const rows = await sql<{ slug: string; updated_at: Date }>(
    `SELECT p.slug,p.updated_at FROM audience_posts p,audience_settings s WHERE s.id=1 AND s.blog_enabled AND s.legal_approved AND p.status='published' AND p.published_at<=now() ORDER BY p.published_at DESC LIMIT 40000`,
  );
  return [
    ...[
      "/produto",
      "/produto/recursos",
      "/produto/seguranca",
      "/blog",
      "/blog/como-produzimos",
      "/blog/correcoes",
      "/ferramentas",
      "/ferramentas/prazos",
      "/ferramentas/rescisao",
    ].map((p) => ({ url: publicUrl(p) })),
    ...rows.map((p) => ({
      url: publicUrl("/blog/" + p.slug),
      lastModified: p.updated_at,
    })),
  ];
}
