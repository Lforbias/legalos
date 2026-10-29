import { SOURCE_POLICIES, type FreshnessLevel, type JobFreshness, type SourceKind } from "./health-policy";

/**
 * Regras PURAS de alerta do Box. Cada fonte/operação tem a sua tolerância (ver health-policy.ts) — não há um limite genérico.
 * O texto do título/corpo é para o advogado (linguagem simples, sem SOAP/WSDL/endpoint); `details` guarda o técnico, só para administradores.
 */
export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";

export type AlertCandidate = {
  /** Chave de deduplicação: o mesmo problema na mesma fonte é um único alerta (que reabre se voltar). */
  dedupeKey: string;
  code: string;
  severity: AlertSeverity;
  title: string;
  body: string;
  sourceKind: SourceKind | null;
  sourceId: string | null;
  details: Record<string, unknown>;
};

export const SEVERITY_ORDER: Record<AlertSeverity, number> = { INFO: 0, WARNING: 1, CRITICAL: 2 };

/** Códigos que o serviço de saúde gerencia (só estes são resolvidos automaticamente quando a condição some). */
export const HEALTH_ALERT_CODES = ["SOURCE_STALE", "SOURCE_NEVER_SYNCED", "SOURCE_FAILING", "SOURCE_NEEDS_ACTION", "SOURCE_SILENT", "RUN_INTERRUPTED", "SOURCE_UNVERIFIED", "CERT_EXPIRING", "JOB_LATE"] as const;

export type SourceAlertInput = {
  kind: SourceKind;
  id: string;
  label: string;
  enabled: boolean;
  freshness: FreshnessLevel;
  minutesSinceSuccess: number | null;
  lastStatus: string | null;
  lastMessage: string | null;
  consecutiveFailures: number;
  silence: { silent: boolean; daysSinceLast: number | null; typicalGapDays: number | null } | null;
  interruptedRun: boolean;
  /** Sincronizou com sucesso mas nunca teve uma verificação real (em produção). */
  unverified: boolean;
  /** Quando o problema só a pessoa resolve (senha recusada, 2º fator, captcha, login expirado): o que precisa ser feito. */
  needsAction?: string | null;
};

const human = (min: number) => (min < 90 ? `${min} minutos` : min < 48 * 60 ? `${Math.round(min / 60)} horas` : `${Math.round(min / 1440)} dias`);
const sourceWord = (k: SourceKind) => (k === "DJEN" ? "O monitoramento do DJEN" : k === "MNI" ? "A conexão com o tribunal" : k === "PORTAL" ? "O acesso ao portal" : "A consulta pública");

export function sourceAlerts(s: SourceAlertInput): AlertCandidate[] {
  if (!s.enabled) return [];
  const out: AlertCandidate[] = [];
  const base = { sourceKind: s.kind, sourceId: s.id };
  const who = `${sourceWord(s.kind)} "${s.label}"`;
  const policy = SOURCE_POLICIES[s.kind];

  if (s.freshness === "LATE" || s.freshness === "CRITICAL") {
    const critical = s.freshness === "CRITICAL";
    out.push({
      ...base,
      dedupeKey: `SOURCE_STALE:${s.kind}:${s.id}`,
      code: "SOURCE_STALE",
      severity: critical ? "CRITICAL" : "WARNING",
      title: critical ? `${who} está parado` : `${who} está atrasado`,
      body: `A última consulta concluída foi há ${human(s.minutesSinceSuccess ?? 0)} (o esperado é a cada ${human(policy.expectedEveryMin)}). ${critical ? "Publicações e intimações novas podem não estar chegando." : "Vamos continuar tentando automaticamente."}`,
      details: { freshness: s.freshness, minutesSinceSuccess: s.minutesSinceSuccess, expectedEveryMin: policy.expectedEveryMin, lastStatus: s.lastStatus, lastMessage: s.lastMessage },
    });
  } else if (s.freshness === "NEVER_LATE") {
    out.push({
      ...base,
      dedupeKey: `SOURCE_NEVER_SYNCED:${s.kind}:${s.id}`,
      code: "SOURCE_NEVER_SYNCED",
      severity: "WARNING",
      title: `${who} ainda não fez a primeira consulta`,
      body: "Configurado há algum tempo, mas nenhuma consulta foi concluída. Confira a conexão ou use \"Verificar agora\".",
      details: { freshness: s.freshness, minutes: s.minutesSinceSuccess, lastStatus: s.lastStatus, lastMessage: s.lastMessage },
    });
  }

  if (s.needsAction) {
    out.push({
      ...base,
      dedupeKey: `SOURCE_NEEDS_ACTION:${s.kind}:${s.id}`,
      code: "SOURCE_NEEDS_ACTION",
      severity: "WARNING",
      title: `${who} precisa da sua ação`,
      body: s.needsAction.slice(0, 500),
      details: { lastStatus: s.lastStatus, lastMessage: s.lastMessage },
    });
  }

  if (s.consecutiveFailures >= policy.recurringFailures && !s.needsAction) {
    out.push({
      ...base,
      dedupeKey: `SOURCE_FAILING:${s.kind}:${s.id}`,
      code: "SOURCE_FAILING",
      severity: s.freshness === "CRITICAL" ? "CRITICAL" : "WARNING",
      title: `${who} está falhando repetidamente`,
      body: `As últimas ${s.consecutiveFailures} tentativas não terminaram com sucesso.${s.lastMessage ? ` Último motivo: ${s.lastMessage}` : ""}`.slice(0, 500),
      details: { consecutiveFailures: s.consecutiveFailures, recurringThreshold: policy.recurringFailures, lastStatus: s.lastStatus, lastMessage: s.lastMessage },
    });
  }

  if (s.silence?.silent) {
    out.push({
      ...base,
      dedupeKey: `SOURCE_SILENT:${s.kind}:${s.id}`,
      code: "SOURCE_SILENT",
      severity: "WARNING",
      title: `${who} parece funcionar, mas não traz publicações há ${s.silence.daysSinceLast} dias`,
      body: `Pelo histórico, o normal seria uma publicação a cada ${s.silence.typicalGapDays ?? "?"} dia(s). Pode ser só um período calmo; confira também no portal oficial.`,
      details: { daysSinceLast: s.silence.daysSinceLast, typicalGapDays: s.silence.typicalGapDays },
    });
  }

  if (s.interruptedRun) {
    out.push({
      ...base,
      dedupeKey: `RUN_INTERRUPTED:${s.kind}:${s.id}`,
      code: "RUN_INTERRUPTED",
      severity: "INFO",
      title: `Uma consulta de ${who.toLowerCase()} foi interrompida`,
      body: "O sistema retomou ou vai retomar de onde parou, sem duplicar publicações.",
      details: {},
    });
  }

  if (s.unverified && s.freshness === "OK") {
    out.push({
      ...base,
      dedupeKey: `SOURCE_UNVERIFIED:${s.kind}:${s.id}`,
      code: "SOURCE_UNVERIFIED",
      severity: "INFO",
      title: `${who} responde, mas ainda não tem uma verificação real registrada`,
      body: "Assim que uma consulta real for concluída, o estado passa a Operacional.",
      details: {},
    });
  }
  return out;
}

export type CertificateAlertInput = { id: string; label: string; notAfter: Date; revokedAt: Date | null };
const DAY = 86_400_000;

/** Validade do certificado A1: avisa com 30, 15 e 7 dias, e quando vence. Revogado não alerta (já está fora de uso). */
export function certificateAlerts(c: CertificateAlertInput, now: Date): AlertCandidate[] {
  if (c.revokedAt) return [];
  const days = Math.floor((c.notAfter.getTime() - now.getTime()) / DAY);
  if (days > 30) return [];
  const severity: AlertSeverity = days <= 7 ? "CRITICAL" : days <= 15 ? "WARNING" : "INFO";
  const when = days < 0 ? `venceu há ${-days} dia(s)` : days === 0 ? "vence hoje" : `vence em ${days} dia(s)`;
  return [
    {
      dedupeKey: `CERT_EXPIRING:${c.id}`,
      code: "CERT_EXPIRING",
      severity: days < 0 ? "CRITICAL" : severity,
      title: `O certificado digital "${c.label}" ${when}`,
      body: days < 0 ? "Consultas e assinaturas que dependem dele deixaram de funcionar. Envie um certificado novo." : "Envie o certificado renovado antes do vencimento para não interromper as consultas.",
      sourceKind: null,
      sourceId: null,
      details: { certificateId: c.id, notAfter: c.notAfter.toISOString(), daysLeft: days },
    },
  ];
}

/** Rotina agendada que não roda: afeta todos os escritórios com a fonte correspondente ligada. */
export function jobAlert(job: { key: string; label: string; level: JobFreshness; minutesLate: number }): AlertCandidate[] {
  if (job.level === "OK") return [];
  const stalled = job.level === "STALLED";
  return [
    {
      dedupeKey: `JOB_LATE:${job.key}`,
      code: "JOB_LATE",
      severity: stalled ? "CRITICAL" : "WARNING",
      title: stalled ? `A rotina automática "${job.label}" parou` : `A rotina automática "${job.label}" está atrasada`,
      body: stalled ? "O agendador não está executando esta rotina. A equipe técnica foi avisada." : "A rotina está rodando com atraso. Se persistir, a equipe técnica será acionada.",
      sourceKind: null,
      sourceId: null,
      details: { job: job.key, minutesLate: job.minutesLate },
    },
  ];
}

/** Resumo de gravidade do conjunto (maior vence). */
export const worstSeverity = (items: readonly { severity: AlertSeverity }[]): AlertSeverity | "OK" => items.reduce<AlertSeverity | "OK">((w, a) => (w === "OK" || SEVERITY_ORDER[a.severity] > SEVERITY_ORDER[w] ? a.severity : w), "OK");


/** Frase de uma linha sobre a fonte, em linguagem do advogado. */
export function sourceHeadline(s: SourceAlertInput & { lastCaptureAt: Date | null }): string {
  if (!s.enabled) return "Desligado.";
  if (s.needsAction) return s.needsAction;
  if (s.freshness === "CRITICAL") return `Parado: sem consulta concluída há ${human(s.minutesSinceSuccess ?? 0)}.`;
  if (s.freshness === "LATE") return `Atrasado: a última consulta concluída foi há ${human(s.minutesSinceSuccess ?? 0)}.`;
  if (s.freshness === "NEVER_LATE" || s.freshness === "NEVER_WAITING") return "Aguardando a primeira consulta.";
  if (s.consecutiveFailures >= SOURCE_POLICIES[s.kind].recurringFailures) return "Falhando repetidamente.";
  if (s.unverified) return "Responde, mas ainda não há uma verificação real registrada: não dá para afirmar que está capturando.";
  if (s.silence?.silent) return `Em dia, mas sem publicações há ${s.silence.daysSinceLast} dias (acima do ritmo normal).`;
  if (s.lastCaptureAt) return `Em dia. Última publicação recebida em ${s.lastCaptureAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`;
  return "Em dia. Nenhuma publicação nova até agora.";
}
