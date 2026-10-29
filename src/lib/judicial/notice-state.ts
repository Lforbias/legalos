import { ORIGIN_LABEL, type OriginKind } from "./contracts";

/**
 * Estados DISTINTOS de uma comunicação. Eles nunca se misturam:
 *  - capturada: o LegalOS recebeu da fonte;
 *  - vista no LegalOS: alguém do escritório abriu aqui (NÃO tem efeito no tribunal);
 *  - ciência oficial: o tribunal registrou que a parte tomou ciência (só a fonte pode confirmar);
 *  - distribuída: tem responsável ou equipe;
 *  - tratada internamente: o escritório encerrou o assunto.
 */
type Tone = "neutral" | "info" | "success" | "warning" | "danger";
export type NoticeStatusKey = "NEW" | "DISTRIBUTED" | "PROCESSED" | "DISCARDED";

export type NoticeStateInput = {
  originKind: string | null;
  firstViewedAt: Date | null;
  officialAckAt: Date | null;
  officialAckState: string | null;
  status: NoticeStatusKey;
  assigneeId: string | null;
  teamId: string | null;
};

export type StateKey = "capture" | "viewed" | "official" | "assignment" | "treatment";
export type StateChip = { key: StateKey; label: string; tone: Tone; /** Explicação curta, em português simples. */ detail: string };

const CAPTURE_LABEL: Record<string, string> = {
  DJEN_PUBLICATION: "Capturada do DJEN",
  PRIVATE_COMMUNICATION: "Capturada do tribunal",
  PROCESS_MOVEMENT: "Movimentação capturada",
  IMPORT: "Histórico importado",
  MANUAL: "Registro manual",
};

export const captureLabel = (origin: string | null | undefined) => (origin ? (CAPTURE_LABEL[origin] ?? "Capturada") : "Registro manual ou importação");
export const originLabel = (origin: string | null | undefined) => (origin ? (ORIGIN_LABEL[origin as OriginKind] ?? "Outra origem") : "Registro manual ou importação");

/** Os cinco estados da comunicação, sempre separados, na ordem em que acontecem. */
export function noticeStates(n: NoticeStateInput): StateChip[] {
  const open = n.status === "NEW" || n.status === "DISTRIBUTED";
  const capture: StateChip = { key: "capture", label: captureLabel(n.originKind), tone: "info", detail: "Como a comunicação chegou ao LegalOS." };
  const viewed: StateChip = n.firstViewedAt
    ? { key: "viewed", label: "Vista no LegalOS", tone: "neutral", detail: "Alguém do escritório abriu esta comunicação aqui. Isso não registra ciência no tribunal." }
    : { key: "viewed", label: "Não vista no LegalOS", tone: open ? "warning" : "neutral", detail: "Ninguém do escritório abriu esta comunicação aqui ainda." };

  let official: StateChip;
  if (n.officialAckAt || n.officialAckState === "ACKNOWLEDGED") official = { key: "official", label: "Ciência oficial registrada", tone: "success", detail: "O tribunal registrou a ciência desta comunicação." };
  else if (n.officialAckState === "UNKNOWN") official = { key: "official", label: "Ciência oficial não confirmada", tone: "warning", detail: "O tribunal ainda não confirmou ciência. Abrir no LegalOS não registra ciência no tribunal." };
  else if (n.officialAckState === "PENDING") official = { key: "official", label: "Ciência oficial pendente", tone: "warning", detail: "A ciência no tribunal ainda não foi registrada." };
  else official = { key: "official", label: "Sem ciência oficial a registrar", tone: "neutral", detail: "Este tipo de comunicação não tem ciência a ser registrada no tribunal." };

  const assigned = n.assigneeId !== null || n.teamId !== null;
  const assignment: StateChip = assigned
    ? { key: "assignment", label: "Distribuída", tone: "info", detail: "Já tem responsável ou equipe." }
    : { key: "assignment", label: "Sem responsável", tone: open ? "warning" : "neutral", detail: "Ainda não foi distribuída para ninguém." };

  const treatment: StateChip =
    n.status === "PROCESSED" ? { key: "treatment", label: "Tratada internamente", tone: "success", detail: "O escritório encerrou o tratamento desta comunicação." }
    : n.status === "DISCARDED" ? { key: "treatment", label: "Descartada", tone: "neutral", detail: "Foi arquivada internamente (por exemplo, repetida ou sem interesse)." }
    : { key: "treatment", label: "Em aberto", tone: "warning", detail: "Ainda precisa ser tratada." };

  return [capture, viewed, official, assignment, treatment];
}

// ------------------------------------------------------------------------------------------------ linha do tempo

/**
 * O banco restringe `notice_events.kind` a poucos tipos (CHECK da migração do Box 2.0). Ações mais finas ficam em
 * `data.action`; aqui está o mapa entre a AÇÃO (o que aconteceu) e o TIPO gravado, nos dois sentidos.
 */
export const NOTICE_ACTIONS = ["CAPTURED", "CREATED", "VIEWED", "ASSIGNED", "TEAM_ASSIGNED", "RETURNED", "TO_ENTRADA", "SNOOZED", "WOKEN", "CASE_LINKED", "PROCESSED", "DISCARDED", "REOPENED", "OFFICIAL_ACK"] as const;
export type NoticeAction = (typeof NOTICE_ACTIONS)[number];
export const NOTICE_DB_KINDS = ["CAPTURED", "VIEWED", "ASSIGNED", "LINKED", "STATUS", "OFFICIAL_ACK", "DOCUMENT", "NOTE", "EVIDENCE"] as const;
export type NoticeDbKind = (typeof NOTICE_DB_KINDS)[number];

const STORED: Record<NoticeAction, { kind: NoticeDbKind; action?: string }> = {
  CAPTURED: { kind: "CAPTURED" },
  CREATED: { kind: "STATUS", action: "created" },
  VIEWED: { kind: "VIEWED" },
  ASSIGNED: { kind: "ASSIGNED", action: "assigned" },
  TEAM_ASSIGNED: { kind: "ASSIGNED", action: "team_assigned" },
  RETURNED: { kind: "ASSIGNED", action: "returned" },
  TO_ENTRADA: { kind: "STATUS", action: "to_entrada" },
  SNOOZED: { kind: "STATUS", action: "snoozed" },
  WOKEN: { kind: "STATUS", action: "woken" },
  CASE_LINKED: { kind: "LINKED" },
  PROCESSED: { kind: "STATUS", action: "processed" },
  DISCARDED: { kind: "STATUS", action: "discarded" },
  REOPENED: { kind: "STATUS", action: "reopened" },
  OFFICIAL_ACK: { kind: "OFFICIAL_ACK" },
};

/** Tipo e marca a gravar para uma ação. */
export const storedEvent = (action: NoticeAction): { kind: NoticeDbKind; action?: string } => STORED[action];

/** Ação semântica de um evento já gravado (tipo + marca em `data.action`). Eventos de outras origens voltam como `null`. */
export function actionOfStored(kind: string, data: Record<string, unknown>): NoticeAction | null {
  const marker = typeof data.action === "string" ? data.action : null;
  for (const a of NOTICE_ACTIONS) {
    const s = STORED[a];
    if (s.kind === kind && (s.action ?? null) === (s.action ? marker : null)) return a;
  }
  // Distribuição sem marca (registro antigo ou de outra origem) continua sendo distribuição.
  return kind === "ASSIGNED" ? "ASSIGNED" : null;
}

export type TimelineNames = { actor: string | null; to: string | null; team: string | null; caseTitle: string | null };
export type TimelineItem = { title: string; detail: string | null; tone: Tone };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const ymd = (v: unknown): string | null => {
  const s = str(v);
  const m = s ? /^(\d{4})-(\d{2})-(\d{2})/.exec(s) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
};

/** Frase da linha do tempo, sem jargão. Eventos desconhecidos (de versões futuras) aparecem de forma genérica, nunca somem. */
export function describeNoticeEvent(kind: string, data: Record<string, unknown>, names: TimelineNames): TimelineItem {
  const who = names.actor ?? "Alguém do escritório";
  switch (actionOfStored(kind, data)) {
    case "CAPTURED": {
      const origin = str(data.origin);
      const source = str(data.source);
      const id = str(data.officialId);
      return { title: `Capturada pelo LegalOS${origin ? ` — ${originLabel(origin)}` : ""}`, detail: [source ? `Fonte: ${source}` : null, id ? `Identificador oficial: ${id}` : null].filter(Boolean).join(" · ") || null, tone: "info" };
    }
    case "CREATED":
      return { title: `Registrada por ${who}`, detail: "Cadastro feito dentro do LegalOS.", tone: "neutral" };
    case "VIEWED":
      return { title: `Vista no LegalOS por ${who}`, detail: "Abrir aqui não registra ciência no tribunal.", tone: "neutral" };
    case "ASSIGNED":
      return { title: `Distribuída para ${names.to ?? "uma pessoa"}`, detail: names.actor ? `Por ${names.actor}.` : null, tone: "info" };
    case "TEAM_ASSIGNED":
      return { title: `Distribuída para a equipe ${names.team ?? ""}`.trim(), detail: names.actor ? `Por ${names.actor}.` : null, tone: "info" };
    case "RETURNED":
      return { title: names.to ? `Devolvida para ${names.to}` : "Devolvida à Entrada", detail: names.actor ? `Por ${names.actor}.` : null, tone: "neutral" };
    case "TO_ENTRADA":
      return { title: "Enviada à Entrada", detail: names.actor ? `Por ${names.actor}.` : null, tone: "neutral" };
    case "SNOOZED":
      return { title: ymd(data.until) ? `Adormecida até ${ymd(data.until)}` : "Adormecida", detail: names.actor ? `Por ${names.actor}.` : null, tone: "neutral" };
    case "WOKEN":
      return { title: "Despertada", detail: names.actor ? `Por ${names.actor}.` : null, tone: "neutral" };
    case "CASE_LINKED":
      return { title: names.caseTitle ? `Vinculada ao processo ${names.caseTitle}` : data.caseId ? "Vinculada a um processo" : "Vínculo com o processo removido", detail: str(data.how) === "AUTO_CNJ" ? "Vinculada automaticamente pelo número CNJ." : names.actor ? `Por ${names.actor}.` : null, tone: "info" };
    case "PROCESSED":
      return { title: "Tratada internamente", detail: names.actor ? `Por ${names.actor}.` : null, tone: "success" };
    case "DISCARDED":
      return { title: "Descartada", detail: [str(data.reason), names.actor ? `Por ${names.actor}.` : null].filter(Boolean).join(" — ") || null, tone: "neutral" };
    case "REOPENED":
      return { title: "Reaberta", detail: names.actor ? `Por ${names.actor}.` : null, tone: "warning" };
    case "OFFICIAL_ACK":
      return { title: "Ciência oficial registrada pelo tribunal", detail: "Confirmada pela fonte oficial.", tone: "success" };
    default:
      return { title: "Evento registrado", detail: null, tone: "neutral" };
  }
}
