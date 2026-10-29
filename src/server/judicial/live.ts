import { EventEmitter } from "node:events";
import { db } from "@/lib/db/client";

/**
 * Sinal de "algo mudou na caixa" para a atualização ao vivo.
 *
 * Sem Redis nem serviço novo: dentro do mesmo processo, quem grava um evento avisa na hora (acorda os canais abertos);
 * como garantia (outro processo, evento gravado por rotina agendada), cada canal também confere o cursor no banco a cada
 * poucos segundos — uma consulta indexada e barata. O sinal NÃO carrega conteúdo: só diz "mudou"; quem recarrega a tela
 * passa de novo pelas regras de permissão e de sigilo.
 */
const g = globalThis as unknown as { __legalosBoxBus?: EventEmitter };
const bus = (g.__legalosBoxBus ??= new EventEmitter().setMaxListeners(0));

export function notifyBoxChange(organizationId: string): void {
  bus.emit(`org:${organizationId}`);
}

export function subscribeBoxChanges(organizationId: string, fn: () => void): () => void {
  bus.on(`org:${organizationId}`, fn);
  return () => bus.off(`org:${organizationId}`, fn);
}

/** Formato válido de marca (o cliente a devolve ao reconectar). */
export const BOX_CURSOR_RE = /^(none|\d{10,16}:[0-9a-f-]{36}:\d{1,9})$/;

/**
 * Marca do estado dos eventos do escritório: o evento mais recente + quantos eventos entraram nos últimos 15 minutos.
 * Só o "mais recente" não basta: uma gravação demorada (lote) leva a hora em que COMEÇOU e pode confirmar depois de
 * outra mais nova; a contagem recente também muda nesse caso. Tudo é calculado no banco (mesmo relógio e fuso das
 * gravações) e a consulta é indexada e barata.
 */
export async function latestBoxCursor(organizationId: string): Promise<string> {
  const rows = await db.$queryRaw<{ id: string; ms: bigint | number; recent: number }[]>`
    SELECT e.id::text AS id,
           (extract(epoch FROM e.created_at) * 1000)::bigint AS ms,
           (SELECT count(*) FROM notice_events r WHERE r.organization_id = ${organizationId}::uuid AND r.created_at > now() - interval '15 minutes')::int AS recent
      FROM notice_events e
     WHERE e.organization_id = ${organizationId}::uuid
     ORDER BY e.created_at DESC, e.id DESC
     LIMIT 1`;
  const last = rows[0];
  return last ? `${Number(last.ms)}:${last.id}:${last.recent}` : "none";
}
