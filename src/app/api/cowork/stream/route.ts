import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { limiters } from "@/lib/security/rate-limit";
import { ensureListener, subscribe, type CoworkEvent } from "@/server/cowork/realtime";
import { coworkRouteContext } from "@/server/cowork/route-auth";
import { can } from "@/server/context";
import { caseVisibility } from "@/server/services/case.service";
import { coworkAvailability } from "@/server/services/cowork-access.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Duração máxima de uma conexão: ao reabrir, a sessão e as permissões são conferidas de novo. */
const MAX_LIFETIME_MS = 10 * 60_000;
const HEARTBEAT_MS = 20_000;

/**
 * Canal de avisos em tempo real (Server-Sent Events). Só leva identificadores (canal, sequência, tipo) das conversas de
 * que a pessoa participa; o conteúdo é sempre buscado pelas rotas autenticadas, que conferem a permissão a cada leitura.
 */
export async function GET(req: NextRequest) {
  const auth = await coworkRouteContext();
  if ("error" in auth) return auth.error;
  const { ctx } = auth;
  if (!limiters.coworkStream.check(`${ctx.organizationId}:${ctx.userId}`)) return NextResponse.json({ error: "Muitas reconexões. Aguarde um instante." }, { status: 429 });
  try {
    await ensureListener();
  } catch (err) {
    logger.warn("cowork.stream.listener_unavailable", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Tempo real indisponível no momento." }, { status: 503 });
  }

  // Só canais de que a pessoa participa; salas de processo, só se ela ainda enxerga o processo (sigilo).
  const loadChannels = async () =>
    new Set(
      (
        await db.coworkChannelMember.findMany({
          where: { userId: ctx.userId, organizationId: ctx.organizationId, channel: can(ctx, "cases:read") ? { OR: [{ caseId: null }, { case: { AND: [{ deletedAt: null }, caseVisibility(ctx)] } }] } : { caseId: null } },
          select: { channelId: true },
        })
      ).map((r) => r.channelId),
    );
  let channels = await loadChannels();
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          close();
        }
      };
      const emit = (e: Omit<CoworkEvent, "o">) => send(`event: cowork\ndata: ${JSON.stringify(e)}\n\n`);
      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(ping);
        clearInterval(recheck);
        clearTimeout(lifetime);
        try {
          controller.close();
        } catch {
          /* já fechado */
        }
      };
      cleanup = close;
      const unsubscribe = subscribe(ctx.organizationId, (e) => {
        const { o: _o, ...rest } = e;
        void _o;
        const mine = e.u?.includes(ctx.userId) ?? false;
        switch (e.t) {
          case "resync":
            void loadChannels().then((s) => {
              channels = s;
              emit({ t: "resync" });
            }, () => emit({ t: "resync" }));
            return;
          case "membership":
            if (mine) {
              void loadChannels().then((s) => {
                channels = s;
                emit({ t: "membership", c: rest.c });
              }, () => undefined);
            } else if (e.c && channels.has(e.c)) emit({ t: "membership", c: e.c });
            return;
          case "read":
            if (mine) emit({ t: "read", c: e.c });
            return;
          case "meeting":
            if (mine) emit({ t: "meeting" });
            return;
          default:
            if (e.c && channels.has(e.c)) emit({ t: e.t, c: e.c, s: e.s, m: e.m });
        }
      });
      const ping = setInterval(() => send(`: ping\n\n`), HEARTBEAT_MS);
      // A cada minuto: bloqueio no Cowork encerra a conexão; perda de acesso a processo tira a sala do filtro.
      const recheck = setInterval(() => {
        void coworkAvailability(ctx).then(async (a) => {
          if (!a.ok) return close();
          channels = await loadChannels();
        }, () => undefined);
      }, 60_000);
      const lifetime = setTimeout(close, MAX_LIFETIME_MS);
      req.signal.addEventListener("abort", close);
      send(`retry: 3000\n\n`);
      emit({ t: "resync" });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
