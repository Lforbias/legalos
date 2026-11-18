import { EventEmitter } from "node:events";
import { Client } from "pg";
import { logger } from "@/lib/logging/logger";
import type { Tx } from "@/lib/db/client";

/**
 * Tempo real do Cowork: Postgres LISTEN/NOTIFY + SSE.
 *
 * - O evento é emitido com `pg_notify` DENTRO da transação que grava o dado: só chega aos ouvintes depois do COMMIT,
 *   então o navegador nunca é avisado de algo que ainda não pode ler (nem de algo que foi desfeito).
 * - O evento carrega apenas identificadores (escritório, canal, sequência, tipo). Nenhum conteúdo de mensagem trafega
 *   pelo canal de avisos: o navegador busca o conteúdo por uma rota autenticada que confere a permissão de novo.
 * - Funciona com mais de uma instância do app, porque o barramento é o próprio Postgres (sem Redis).
 * - Se a conexão de escuta cair, os assinantes recebem `resync` e o navegador recupera tudo pela sequência do canal.
 */
export const COWORK_PG_CHANNEL = "cowork_events";

export type CoworkEventType =
  | "message" // nova mensagem (s = seq)
  | "message_updated" // edição/exclusão/nova resposta (m = id)
  | "channel" // canal criado/alterado/arquivado
  | "membership" // participantes alterados (u = pessoas afetadas)
  | "read" // leitura marcada (u = quem leu)
  | "meeting" // reunião criada/alterada (u = participantes)
  | "resync"; // reconexão do barramento: recarregar estado

export type CoworkEvent = {
  /** organizationId */
  o: string;
  t: CoworkEventType;
  /** channelId */
  c?: string;
  /** seq da mensagem */
  s?: number;
  /** id da mensagem */
  m?: string;
  /** pessoas especificamente afetadas */
  u?: string[];
};

/** Enfileira o aviso na transação (entregue no COMMIT). */
export async function publishInTx(tx: Tx, event: CoworkEvent): Promise<void> {
  const payload = JSON.stringify(event);
  if (payload.length > 7000) throw new Error("Evento do Cowork grande demais.");
  await tx.$executeRaw`SELECT pg_notify(${COWORK_PG_CHANNEL}, ${payload})`;
}

type Bus = {
  emitter: EventEmitter;
  client: Client | null;
  connecting: Promise<void> | null;
  retry: number;
  subscribers: number;
  everConnected: boolean;
};

const g = globalThis as unknown as { __coworkBus?: Bus };
function bus(): Bus {
  if (!g.__coworkBus) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    g.__coworkBus = { emitter, client: null, connecting: null, retry: 0, subscribers: 0, everConnected: false };
  }
  return g.__coworkBus;
}

function isEvent(v: unknown): v is CoworkEvent {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return typeof e.o === "string" && typeof e.t === "string";
}

async function connect(b: Bus): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida.");
  const client = new Client({ connectionString: url, application_name: "legalos-cowork-listener" });
  const reconnect = (reason: string) => {
    if (b.client !== client) return;
    b.client = null;
    logger.warn("cowork.realtime.disconnected", { reason });
    client.removeAllListeners();
    client.end().catch(() => undefined);
    // Avisa os navegadores para recuperar o estado pela sequência (nada se perde: o banco é a fonte da verdade).
    b.emitter.emit("event", { o: "*", t: "resync" } satisfies CoworkEvent);
    if (b.subscribers > 0) {
      const delay = Math.min(30_000, 500 * 2 ** b.retry++);
      setTimeout(() => void ensureListener().catch(() => undefined), delay).unref?.();
    }
  };
  client.on("error", (err) => reconnect(err.message));
  client.on("end", () => reconnect("end"));
  client.on("notification", (msg) => {
    if (msg.channel !== COWORK_PG_CHANNEL || !msg.payload) return;
    try {
      const parsed: unknown = JSON.parse(msg.payload);
      if (isEvent(parsed)) b.emitter.emit("event", parsed);
    } catch {
      /* payload inválido: ignorado */
    }
  });
  await client.connect();
  await client.query(`LISTEN ${COWORK_PG_CHANNEL}`);
  b.client = client;
  b.retry = 0;
  // Reconectou: avisos emitidos durante a queda se perderam; os navegadores recuperam pela sequência.
  if (b.everConnected) b.emitter.emit("event", { o: "*", t: "resync" } satisfies CoworkEvent);
  b.everConnected = true;
}

/** Garante uma única conexão de escuta por processo. */
export async function ensureListener(): Promise<void> {
  const b = bus();
  if (b.client) return;
  if (!b.connecting) {
    b.connecting = connect(b).finally(() => {
      b.connecting = null;
    });
  }
  return b.connecting;
}

/** Assina os eventos de um escritório. Retorna a função de cancelamento. */
export function subscribe(organizationId: string, fn: (e: CoworkEvent) => void): () => void {
  const b = bus();
  const handler = (e: CoworkEvent) => {
    if (e.o === organizationId || e.o === "*") fn(e);
  };
  b.emitter.on("event", handler);
  b.subscribers++;
  return () => {
    b.emitter.off("event", handler);
    b.subscribers = Math.max(0, b.subscribers - 1);
  };
}

export function listenerConnected(): boolean {
  return Boolean(bus().client);
}
