import { posts } from "@/server/audience/store";
import { publicUrl, escapeXml as e } from "@/lib/audience/policy";
export const dynamic = "force-dynamic";
export async function GET() {
  const rows = await posts();
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>LegalOS Blog</title><link>${e(publicUrl("/blog"))}</link><description>Direito na prática, com fonte e data.</description><language>pt-BR</language>${rows.map((p) => `<item><title>${e(p.title)}</title><link>${e(publicUrl("/blog/" + p.slug))}</link><guid>${e(publicUrl("/blog/" + p.slug))}</guid><description>${e(p.summary)}</description><pubDate>${p.published_at.toUTCString()}</pubDate></item>`).join("")}</channel></rss>`;
  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
