import { db } from "@/lib/db/client";
import { RateLimiter } from "@/lib/security/rate-limit";
import { uuidSchema } from "@/lib/validation/common";
import { liveSessions } from "@/lib/whatsapp/qr/live";
import { can } from "@/server/context";
import { getTenant } from "@/server/session";

const limiter = new RateLimiter(60, 60_000);
const maxBytes = 512 * 1024;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const unavailable = () => new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const tenant = await getTenant();
  if (!tenant) return new Response(null, { status: 401 });
  if (!can(tenant.ctx, "whatsapp:read")) return new Response(null, { status: 403 });
  const id = uuidSchema.safeParse((await params).id);
  if (!id.success) return unavailable();

  const conversation = await db.whatsappConversation.findFirst({
    where: { id: id.data, organizationId: tenant.ctx.organizationId, account: { provider: "QR", enabled: true } },
    select: { accountId: true, waId: true },
  });
  if (!conversation) return unavailable();
  const session = liveSessions.get(conversation.accountId)?.session;
  if (!session?.profilePictureUrl) return unavailable();
  if (!limiter.check(tenant.ctx.organizationId)) return new Response(null, { status: 429 });

  try {
    const raw = await session.profilePictureUrl(conversation.waId);
    if (!raw) return unavailable();
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.port || url.username || url.password || !url.hostname.endsWith(".whatsapp.net")) {
      return unavailable();
    }
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(4000), cache: "no-store" });
    const mime = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (!response.ok || !response.body || !mime || !imageTypes.has(mime) || Number(response.headers.get("content-length")) > maxBytes) {
      await response.body?.cancel();
      return unavailable();
    }

    const image = new Uint8Array(maxBytes);
    const reader = response.body.getReader();
    let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (size + chunk.value.byteLength > maxBytes) {
          await reader.cancel();
          return unavailable();
        }
        image.set(chunk.value, size);
        size += chunk.value.byteLength;
      }
    } finally {
      reader.releaseLock();
    }
    if (!size) return unavailable();
    return new Response(image.subarray(0, size), {
      headers: {
        "Content-Type": mime,
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch {
    return unavailable();
  }
}
