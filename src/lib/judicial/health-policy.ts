/**
 * Política de saúde POR FONTE (não existe uma tolerância genérica). Funções puras e testáveis.
 * Os limites partem da frequência esperada de cada fonte e da criticidade para o advogado.
 */
export type SourceKind = "DJEN" | "MNI" | "PORTAL" | "DATAJUD";

export type SourcePolicy = {
  /** De quanto em quanto tempo o agendador deveria executar esta fonte. */
  expectedEveryMin: number;
  /** Sem sucesso há mais que isso = atrasada (aviso). */
  staleAfterMin: number;
  /** Sem sucesso há mais que isso = crítica (o advogado pode estar perdendo publicações). */
  criticalAfterMin: number;
  /** Uma fonte nova precisa ter a primeira execução em até isto, senão é alerta. */
  neverSyncedGraceMin: number;
  /** Falhas seguidas que tornam o problema "recorrente". */
  recurringFailures: number;
  /** Silêncio suspeito: dias sem nenhuma captura, comparado ao ritmo histórico (mínimo absoluto). */
  minSilenceDays: number;
};

export const SOURCE_POLICIES: Record<SourceKind, SourcePolicy> = {
  // Publicações públicas: crítico para prazos. O agendador roda a cada 30 min.
  DJEN: { expectedEveryMin: 30, staleAfterMin: 90, criticalAfterMin: 6 * 60, neverSyncedGraceMin: 15, recurringFailures: 3, minSilenceDays: 10 },
  // Intimações privadas por MNI: crítico (gera prazo), mesmo agendador.
  MNI: { expectedEveryMin: 30, staleAfterMin: 90, criticalAfterMin: 6 * 60, neverSyncedGraceMin: 15, recurringFailures: 3, minSilenceDays: 10 },
  // Robô de portal: depende de 2º fator/captcha; tolera mais.
  PORTAL: { expectedEveryMin: 15, staleAfterMin: 4 * 60, criticalAfterMin: 24 * 60, neverSyncedGraceMin: 30, recurringFailures: 3, minSilenceDays: 14 },
  // Dados públicos de processo: diário basta.
  DATAJUD: { expectedEveryMin: 24 * 60, staleAfterMin: 3 * 24 * 60, criticalAfterMin: 10 * 24 * 60, neverSyncedGraceMin: 60, recurringFailures: 3, minSilenceDays: 30 },
};

export type FreshnessLevel = "OFF" | "NEVER_WAITING" | "NEVER_LATE" | "OK" | "LATE" | "CRITICAL";

const MIN = 60_000;

export function evaluateFreshness(i: { policy: SourcePolicy; enabled: boolean; createdAt: Date; lastSuccessAt: Date | null; now: Date }): { level: FreshnessLevel; minutes: number } {
  if (!i.enabled) return { level: "OFF", minutes: 0 };
  if (!i.lastSuccessAt) {
    const age = Math.floor((i.now.getTime() - i.createdAt.getTime()) / MIN);
    return { level: age > i.policy.neverSyncedGraceMin ? "NEVER_LATE" : "NEVER_WAITING", minutes: age };
  }
  const m = Math.floor((i.now.getTime() - i.lastSuccessAt.getTime()) / MIN);
  if (m > i.policy.criticalAfterMin) return { level: "CRITICAL", minutes: m };
  if (m > i.policy.staleAfterMin) return { level: "LATE", minutes: m };
  return { level: "OK", minutes: m };
}

/**
 * "Funciona, mas não entrega": compara o intervalo atual sem capturas com o ritmo histórico.
 * Exige histórico mínimo (5 capturas em 90 dias) para não gerar alarme falso em escritórios novos.
 */
export function detectSilence(i: { captureTimes: readonly Date[]; lastCaptureAt: Date | null; now: Date; policy: SourcePolicy }): { silent: boolean; reason: "NO_HISTORY" | "WITHIN_RHYTHM" | "SUSPICIOUS_SILENCE"; daysSinceLast: number | null; typicalGapDays: number | null } {
  const DAY = 86_400_000;
  const horizon = i.now.getTime() - 90 * DAY;
  const times = i.captureTimes.map((d) => d.getTime()).filter((t) => t >= horizon).sort((a, b) => a - b);
  const last = i.lastCaptureAt ? i.lastCaptureAt.getTime() : null;
  const daysSinceLast = last === null ? null : Math.floor((i.now.getTime() - last) / DAY);
  if (times.length < 5) return { silent: false, reason: "NO_HISTORY", daysSinceLast, typicalGapDays: null };
  const gaps: number[] = [];
  for (let k = 1; k < times.length; k++) gaps.push((times[k]! - times[k - 1]!) / DAY);
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)]!;
  const threshold = Math.max(i.policy.minSilenceDays, Math.ceil(median * 5));
  const silent = daysSinceLast !== null && daysSinceLast >= threshold;
  return { silent, reason: silent ? "SUSPICIOUS_SILENCE" : "WITHIN_RHYTHM", daysSinceLast, typicalGapDays: Math.round(median * 10) / 10 };
}

export type JobFreshness = "OK" | "LATE" | "STALLED";

/**
 * Rotina agendada parada: atrasada com 1,5× o intervalo esperado (para uma rotina de 30 min = 15 min de atraso),
 * travada com 3×. Assim a paralisação crítica aparece dentro de ~15 minutos quando a verificação roda a cada 5 min.
 */
export function evaluateJobFreshness(i: { everyMin: number; lastStartedAt: Date | null; now: Date }): { level: JobFreshness; minutesLate: number } {
  if (!i.lastStartedAt) return { level: "LATE", minutesLate: 0 };
  const since = (i.now.getTime() - i.lastStartedAt.getTime()) / MIN;
  const late = since - i.everyMin;
  if (since > i.everyMin * 3) return { level: "STALLED", minutesLate: Math.floor(late) };
  if (since > i.everyMin * 1.5) return { level: "LATE", minutesLate: Math.floor(late) };
  return { level: "OK", minutesLate: 0 };
}

/** Uma execução que diz estar "em andamento" mas não dá sinal de vida há mais que isto está interrompida. */
export const RUN_HEARTBEAT_TIMEOUT_MIN = 10;
export const isRunInterrupted = (heartbeatAt: Date, now: Date) => now.getTime() - heartbeatAt.getTime() > RUN_HEARTBEAT_TIMEOUT_MIN * MIN;
