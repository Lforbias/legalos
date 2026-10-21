import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { RateLimiter } from "@/lib/security/rate-limit";
import { can } from "@/server/context";
import { listCases } from "@/server/services/case.service";
import { listClients } from "@/server/services/client.service";
import { getTenant } from "@/server/session";

export const dynamic = "force-dynamic";
const limiter = new RateLimiter(60, 60_000);

/** Busca global (membros, clientes e processos). Autenticada, restrita ao escritório, às permissões e ao sigilo de processos. */
export async function GET(req: NextRequest) {
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { ctx } = tenant;
  if (!limiter.check(ctx.userId)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ members: [], clients: [], cases: [] });

  const [rows, clients, cases] = await Promise.all([
    can(ctx, "members:read") ? searchMembers(ctx.organizationId, q) : Promise.resolve([]),
    can(ctx, "clients:read") ? searchClientsGlobal(ctx, q) : Promise.resolve([]),
    can(ctx, "cases:read") ? listCases(ctx, { q, board: true }).then((r) => r.items.slice(0, 5)) : Promise.resolve([]),
  ]);
  return NextResponse.json({
    members: rows.map((r) => ({ id: r.id, name: r.user.name, email: r.user.email, role: r.role.name })),
    clients: clients.map((c) => ({ id: c.id, name: c.name, document: c.document, type: c.type })),
    cases: cases.map((c) => ({ id: c.id, title: c.title, number: c.number })),
  });
}

async function searchClientsGlobal(ctx: Parameters<typeof listClients>[0], q: string) {
  return (await listClients(ctx, { q })).items.slice(0, 5);
}

async function searchMembers(organizationId: string, q: string) {
  return db.membership.findMany({
    where: {
      organizationId,
      user: { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] },
    },
    take: 5,
    select: { id: true, user: { select: { name: true, email: true } }, role: { select: { name: true } } },
  });
}
