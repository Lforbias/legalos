import { NextResponse, type NextRequest } from "next/server";
import { boxV2Enabled, boxV2EnabledAnywhere } from "@/lib/features";
import { logger } from "@/lib/logging/logger";
import { can } from "@/server/context";
import { BOX_CURSOR_RE, latestBoxCursor, subscribeBoxChanges } from "@/server/judicial/live";
import { noticeBoxCounts } from "@/server/services/notice.service";
import { getTenant } from "@/server/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Intervalo de conferência do cursor no banco (garantia quando o aviso em memória não chega). Pior caso de atraso ≈ este valor. */
const CHECK_EVERY_MS = 4_000;
const HEARTBEAT_MS = 20_000;
/** O canal se encerra sozinho; o navegador reconecta e a sessão é revalidada a cada reconexão. */
const MAX_LIFETIME_MS = 5 * 60_000;
const MAX_PER_USER = 4;
const open = new Map<string, number>();

/**
 * Canal de atualização ao vivo da caixa (Server-Sent Events). Autenticado, restrito ao escritório e à permissão de leitura.
 * Só envia "ready" e "changed" (com contagens já filtradas por permissão e sigilo): nunca conteúdo de comunicação.
 * Sem a chave LEGALOS_BOX_V2 a rota não existe.
 */
export async function GET(req: NextRequest) {
  if (!boxV2EnabledAnywhere()) return new NextResponse("Not found", { status: 404 }); // tudo desligado: a rota não existe, nem para quem não entrou
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { ctx } = tenant;
  if (!boxV2Enabled(ctx.organizationId)) return new NextResponse("Not found", { status: 404 });
  if (!can(ctx, "inbox:read")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const mine = open.get(ctx.userId) ?? 0;
  if (mine >= MAX_PER_USER) return NextResponse.json({ error: "too_many_streams" }, { status: 429 });
  open.set(ctx.userId, mine + 1);

  const asked = req.nextUrl.searchParams.get("cursor");
  const given = asked && BOX_CURSOR_RE.test(asked) ? asked : null;
  const enc = new TextEncoder();
  let closed = false;
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (chunk: string) => { if (!closed) { try { controller.enqueue(enc.encode(chunk)); } catch { close(); } } };
      const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      let checking = false;
      let last = "none";
      const timers: ReturnType<typeof setTimeout>[] = [];
      let unsubscribe = () => {};

      function close() {
        if (closed) return;
        closed = true;
        for (const t of timers) { clearTimeout(t); clearInterval(t); }
        unsubscribe();
        const n = (open.get(ctx.userId) ?? 1) - 1;
        if (n <= 0) open.delete(ctx.userId); else open.set(ctx.userId, n);
        try { controller.close(); } catch { /* já fechado */ }
      }
      cleanup = close;

      const check = async () => {
        if (closed || checking) return;
        checking = true;
        try {
          const cursor = await latestBoxCursor(ctx.organizationId);
          if (cursor !== last) {
            last = cursor;
            const c = await noticeBoxCounts(ctx);
            send("changed", { cursor, entrada: c.entrada, minhas: c.minhas, at: Date.now() });
          }
        } catch (e) {
          logger.warn("box.events.check_failed", { error: e instanceof Error ? e.message : String(e) });
        } finally {
          checking = false;
        }
      };

      try {
        // Retoma de onde a tela parou (marca devolvida pelo navegador); sem marca, parte do estado atual.
        last = given ?? (await latestBoxCursor(ctx.organizationId));
      } catch (e) {
        logger.warn("box.events.start_failed", { error: e instanceof Error ? e.message : String(e) });
        close();
        return;
      }
      write("retry: 3000\n\n");
      send("ready", { cursor: last, at: Date.now() });
      timers.push(setInterval(check, CHECK_EVERY_MS));
      timers.push(setInterval(() => write(": ping\n\n"), HEARTBEAT_MS));
      timers.push(setTimeout(close, MAX_LIFETIME_MS));
      // Aviso imediato quando a gravação foi neste mesmo processo; uma pequena espera deixa a transação confirmar.
      unsubscribe = subscribeBoxChanges(ctx.organizationId, () => { setTimeout(check, 250); });
      req.signal.addEventListener("abort", close);
      // Se a tela veio com uma marca antiga, avisa já (algo entrou entre a montagem da página e a conexão).
      void check();
    },
    cancel() { cleanup(); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform impede que compressão/proxy segurem os dados; X-Accel-Buffering desliga o buffer do nginx.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
