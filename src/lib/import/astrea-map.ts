import { createHash } from "node:crypto";
import { contentHash } from "@/lib/notices/parse";
import { formatCnj, isValidCnj, normalizeDocument, onlyDigits } from "@/lib/validation/br-documents";

export type Row = Record<string, string>;

// ---------- utilitários ----------

/** O Astrea exporta "null" como texto em alguns campos. */
export function clean(v: string | undefined): string {
  const t = (v ?? "").trim();
  return t.toLowerCase() === "null" ? "" : t;
}

export function splitList(v: string | undefined): string[] {
  return clean(v)
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function truncate(v: string, max: number): string {
  return v.length <= max ? v : `${v.slice(0, max - 1).trimEnd()}…`;
}

function realYmd(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Aceita "2025-08-19", "2025-08-19 10:00", "19/08/2025" e "19/08/2025 10:00". Retorna data e hora (se houver). */
export function parseDateTime(v: string | undefined): { ymd: string; hhmm: string | null } | null {
  const t = clean(v);
  if (!t) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(t);
  if (m) {
    const ymd = realYmd(+m[1]!, +m[2]!, +m[3]!);
    return ymd ? { ymd, hhmm: m[4] ? `${m[4]}:${m[5]}` : null } : null;
  }
  m = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(t);
  if (m) {
    const ymd = realYmd(+m[3]!, +m[2]!, +m[1]!);
    return ymd ? { ymd, hhmm: m[4] ? `${m[4]}:${m[5]}` : null } : null;
  }
  return null;
}

export const parseDate = (v: string | undefined) => parseDateTime(v)?.ymd ?? null;

export function validHhmm(v: string | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(clean(v));
  if (!m) return null;
  const h = +m[1]!;
  const mi = +m[2]!;
  return h < 24 && mi < 60 ? `${String(h).padStart(2, "0")}:${m[2]}` : null;
}

// ---------- contatos → clientes ----------

export type ClientDraft = {
  externalId: string;
  type: "PERSON" | "COMPANY";
  name: string;
  tradeName: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  notes: string | null;
  addressZip: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressDistrict: string | null;
  addressCity: string | null;
  addressState: string | null;
  warnings: string[];
};

const first = (v: string | undefined) => splitList(v)[0] ?? "";

export function mapContact(r: Row): ClientDraft | null {
  const externalId = clean(r["Código"]);
  const name = clean(r["Nome"]);
  if (!externalId || name.length < 2) return null;
  const type = clean(r["Tipo do contato"]) === "Pessoa Jurídica" ? "COMPANY" : "PERSON";
  const warnings: string[] = [];
  const rawDoc = clean(r["CPF"]);
  let document: string | null = null;
  if (rawDoc) {
    document = normalizeDocument(type, rawDoc);
    if (!document) warnings.push(`${type === "PERSON" ? "CPF" : "CNPJ"} inválido no Astrea: ${rawDoc}`);
  }
  const emailRaw = first(r["Endereços de email"]).toLowerCase();
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) && emailRaw.length <= 254 ? emailRaw : null;
  let phone: string | null = null;
  for (const p of splitList(r["Número dos telefones"])) {
    const d = onlyDigits(p);
    if ([10, 11, 12, 13].includes(d.length)) {
      phone = d;
      break;
    }
  }
  const by = +clean(r["Ano de nascimento"]);
  const bm = +clean(r["Mês de nascimento"]);
  const bd = +clean(r["Dia de nascimento"]);
  const birthDate = by && bm && bd ? realYmd(by, bm, bd) : null;
  const uf = first(r["Estados"]).toUpperCase();
  const zip = onlyDigits(first(r["CEP"]));
  const extra: string[] = [];
  const add = (label: string, v: string | undefined) => {
    const t = clean(v);
    if (t) extra.push(`${label}: ${t}`);
  };
  add("RG", r["RG"]);
  add("Estado civil", r["Estado civil"]);
  add("Nacionalidade", r["Nacionalidade"]);
  add("Naturalidade", r["Naturalidade"]);
  add("Profissão", r["Ocupação"]);
  add("Mãe", r["Nome da mãe"]);
  add("Pai", r["Nome do pai"]);
  add("Título de eleitor", r["Título de eleitor"] || r["Titulo"]);
  add("CNH", r["CNH"]);
  add("PIS", r["PIS"]);
  add("CTPS", r["CTPS"]);
  const comment = clean(r["Comentário"]);
  const notes = [comment, extra.length ? `Dados do Astrea — ${extra.join("; ")}` : "", ...warnings.map((w) => `Atenção: ${w}`)].filter(Boolean).join("\n\n");
  return {
    externalId,
    type,
    name: truncate(name, 200),
    tradeName: type === "COMPANY" && clean(r["Apelido"]) ? truncate(clean(r["Apelido"]), 200) : null,
    document,
    email,
    phone,
    birthDate,
    notes: notes ? truncate(notes, 4000) : null,
    addressZip: zip.length === 8 ? zip : null,
    addressStreet: first(r["Ruas"]) ? truncate(first(r["Ruas"]), 200) : null,
    addressNumber: first(r["Números"]) ? truncate(first(r["Números"]), 20) : null,
    addressComplement: first(r["Complementos"]) ? truncate(first(r["Complementos"]), 100) : null,
    addressDistrict: first(r["Bairros"]) ? truncate(first(r["Bairros"]), 100) : null,
    addressCity: first(r["Cidades"]) ? truncate(first(r["Cidades"]), 100) : null,
    addressState: /^[A-Z]{2}$/.test(uf) ? uf : null,
    warnings,
  };
}

// ---------- processos ----------

export type CaseDraft = {
  externalId: string;
  title: string;
  number: string | null;
  legacyNumber: string | null;
  courtUnit: string | null;
  status: "ACTIVE" | "ARCHIVED" | "CLOSED";
  phase: string | null;
  distributedAt: string | null;
  createdAt: string | null;
  notes: string | null;
  clientCodes: string[];
  clientQualificationCodes: string[];
  partyCodes: string[];
  partyQualificationCodes: string[];
  responsibleCode: string;
  userCodes: string[];
};

/** Tipos do Astrea que são processos/casos. "Atendimento" (contato inicial) não é processo e fica de fora. */
export const CASE_TYPES = new Set(["Processo", "Caso", "Incidente"]);

export function mapCase(r: Row): CaseDraft | null {
  const externalId = clean(r["Código"]);
  if (!externalId || !CASE_TYPES.has(clean(r["Tipo"]))) return null;
  const title = clean(r["Titulo"]) || clean(r["Pasta"]);
  if (!title) return null;
  const raw = clean(r["Número do processo"]);
  const cnj = raw && isValidCnj(raw) ? formatCnj(raw) : null;
  const ended = parseDate(r["Data de encerramento"]);
  const active = clean(r["Status"]) === "Ativo";
  const inst = clean(r["Instância"]);
  const notes = [clean(r["Observação"]), clean(r["Pasta"]) && clean(r["Pasta"]) !== title ? `Pasta: ${clean(r["Pasta"])}` : "", clean(r["Url do Processo"]) ? `Link: ${clean(r["Url do Processo"])}` : "", ended ? `Encerrado em ${ended.split("-").reverse().join("/")} (Astrea).` : ""]
    .filter(Boolean)
    .join("\n");
  return {
    externalId,
    title: truncate(title, 300),
    number: cnj,
    legacyNumber: !cnj && raw ? truncate(raw, 60) : null,
    courtUnit: clean(r["Nome da Vara"]) ? truncate(clean(r["Nome da Vara"]), 200) : null,
    status: active ? "ACTIVE" : ended ? "CLOSED" : "ARCHIVED",
    phase: ["1", "2", "3"].includes(inst) ? `${inst}ª instância` : null,
    distributedAt: parseDate(r["Data de distribuição"]),
    createdAt: parseDate(r["Data de criação"]),
    notes: notes ? truncate(notes, 4000) : null,
    clientCodes: splitList(r["Clientes"]),
    clientQualificationCodes: splitList(r["Qualificações dos clientes"]),
    partyCodes: splitList(r["Contatos das partes"]),
    partyQualificationCodes: splitList(r["Qualificações das partes"]),
    responsibleCode: clean(r["Responsável"]),
    userCodes: splitList(r["Usuários"]),
  };
}

export function partyRoleFromQualification(tipo: string | undefined): "PLAINTIFF" | "DEFENDANT" | "THIRD_PARTY" | "OTHER" {
  const t = clean(tipo);
  return t === "Ativo" ? "PLAINTIFF" : t === "Passivo" ? "DEFENDANT" : t === "Neutro" ? "THIRD_PARTY" : "OTHER";
}

// ---------- prazos ----------

export type DeadlineDraft = {
  externalId: string;
  caseCode: string;
  title: string;
  dueDate: string;
  status: "DRAFT" | "FULFILLED" | "CANCELED";
  changedAt: string | null;
  notes: string | null;
  responsibleCode: string;
};

export function mapDeadline(r: Row): DeadlineDraft | null {
  const externalId = clean(r["Código"]);
  const due = parseDate(r["Data de vencimento"]);
  const title = clean(r["Nome"]);
  const caseCode = clean(r["Processo"]);
  if (!externalId || !due || !title || !caseCode) return null;
  const st = clean(r["Status"]);
  const reason = clean(r["Razão mudança de status"]);
  const comment = clean(r["Comentários"]);
  return {
    externalId,
    caseCode,
    title: truncate(title, 200),
    dueDate: due,
    // "Em progresso" fica como RASCUNHO: prazo pendente precisa de conferência humana no LegalOS.
    status: st === "Feito" ? "FULFILLED" : st === "Cancelado" ? "CANCELED" : "DRAFT",
    changedAt: parseDate(r["Data da última alteração"]),
    notes: truncate([comment, reason ? `Motivo da mudança de status: ${reason}` : "", "Importado do Astrea."].filter(Boolean).join("\n"), 4000),
    responsibleCode: clean(r["Responsável"]),
  };
}

// ---------- tarefas ----------

export type TaskDraft = {
  externalId: string;
  caseCode: string;
  title: string;
  description: string | null;
  done: boolean;
  priority: "LOW" | "NORMAL" | "HIGH";
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string | null;
  assigneeCode: string;
};

export function mapTask(r: Row): TaskDraft | null {
  const externalId = clean(r["Código"]);
  const text = clean(r["Descrição"]);
  if (!externalId || !text) return null;
  const firstLine = text.split(/\r?\n/)[0]!.trim();
  const title = truncate(firstLine || text, 200);
  const comment = clean(r["Comentários"]);
  const author = clean(r["Autor comentário"]);
  const body = [text.length > title.length || text.includes("\n") ? text : "", comment ? `Comentário${author ? ` (usuário ${author})` : ""}: ${comment}` : ""].filter(Boolean).join("\n\n");
  const p = clean(r["Prioridade"]);
  return {
    externalId,
    caseCode: clean(r["Processo"]),
    title,
    description: body ? truncate(body, 8000) : null,
    done: clean(r["Realizada"]) === "Sim",
    priority: p === "Alta" ? "HIGH" : p === "Média" ? "NORMAL" : "LOW",
    dueDate: parseDate(r["Data de vencimento"]),
    completedAt: parseDate(r["Data fim"]),
    createdAt: parseDate(r["Data de criação"]),
    assigneeCode: clean(r["Responsável"]),
  };
}

// ---------- agenda ----------

export type EventDraft = {
  externalId: string;
  kind: "HEARING" | "OTHER";
  title: string;
  startYmd: string;
  startHhmm: string | null;
  endYmd: string | null;
  endHhmm: string | null;
  allDay: boolean;
  location: string | null;
  description: string | null;
  caseCode: string;
  canceled: boolean;
};

export function mapHearing(r: Row): EventDraft | null {
  const externalId = clean(r["Código"]);
  const start = parseDateTime(r["Data de início"]);
  if (!externalId || !start) return null;
  const hhmm = validHhmm(r["Hora de início"]) ?? start.hhmm;
  const place = [clean(r["Fórum"]), clean(r["Sala do Fórum"]) ? `Sala ${clean(r["Sala do Fórum"])}` : "", clean(r["Endereço"])].filter(Boolean).join(" — ");
  return {
    externalId,
    kind: "HEARING",
    title: truncate(clean(r["Nome"]) || "Audiência", 200),
    startYmd: start.ymd,
    startHhmm: hhmm,
    endYmd: start.ymd,
    endHhmm: validHhmm(r["Hora de fim"]),
    allDay: !hhmm,
    location: place ? truncate(place, 300) : null,
    description: clean(r["Comentários"]) ? truncate(clean(r["Comentários"]), 4000) : null,
    caseCode: clean(r["Processo"]),
    canceled: clean(r["Status"]) === "Cancelado",
  };
}

export function mapEvent(r: Row): EventDraft | null {
  const externalId = clean(r["Código"]);
  const start = parseDateTime(r["Data de início"]);
  const desc = clean(r["Descrição"]);
  if (!externalId || !start || !desc) return null;
  const allDay = clean(r["Dia inteiro"]) === "Sim";
  const hhmm = validHhmm(r["Hora de início"]) ?? start.hhmm;
  const end = parseDateTime(r["Data de término"]);
  return {
    externalId,
    kind: "OTHER",
    title: truncate(desc.split(/\r?\n/)[0]!, 200),
    startYmd: start.ymd,
    startHhmm: allDay ? null : hhmm,
    endYmd: end?.ymd ?? start.ymd,
    endHhmm: allDay ? null : validHhmm(r["Hora de fim"]),
    allDay: allDay || !hhmm,
    location: null,
    description: truncate([desc.includes("\n") ? desc : "", clean(r["Detalhes"])].filter(Boolean).join("\n\n"), 4000) || null,
    caseCode: clean(r["Processo"]),
    canceled: clean(r["Status"]) === "Cancelado",
  };
}

// ---------- publicações → intimações ----------

export type NoticeDraft = {
  externalId: string;
  title: string;
  content: string;
  court: string | null;
  publishedAt: string | null;
  receivedAt: string | null;
  status: "NEW" | "PROCESSED" | "DISCARDED";
  caseCode: string;
  contentHash: string;
};

export function mapPublication(r: Row): NoticeDraft | null {
  const externalId = clean(r["Código"]);
  const content = clean(r["Matéria"]);
  if (!externalId || !content) return null;
  const orgao = clean(r["Orgão"]);
  const st = clean(r["Status"]);
  const published = parseDate(r["Data publicacao"]) ?? parseDate(r["Data divulgacao"]);
  return {
    externalId,
    title: truncate(orgao ? `Publicação — ${orgao}` : "Publicação importada do Astrea", 200),
    content: truncate(content, 100_000),
    court: orgao ? truncate(orgao, 200) : null,
    publishedAt: published,
    receivedAt: parseDate(r["Data de lançamento"]) ?? parseDate(r["Data divulgacao"]) ?? published,
    status: st === "Tratada" ? "PROCESSED" : st === "Rejeitada" ? "DISCARDED" : "NEW",
    caseCode: clean(r["Processo"]),
    contentHash: contentHash(content),
  };
}

/** Hash estável usado só para nomear armazenamento temporário/relatórios (não é segurança). */
export const shortHash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 10);

// ---------- financeiro ----------

/** "744.3" | "-1200.00" | "300" → centavos absolutos (BigInt como string decimal "744.30") e sinal. Nunca usa ponto flutuante. */
export function parseAstreaMoney(v: string | undefined): { negative: boolean; amount: string } | null {
  const t = clean(v).replace(/\s/g, "");
  const m = /^(-)?(\d{1,12})(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  return { negative: Boolean(m[1]), amount: `${m[2]}.${(m[3] ?? "").padEnd(2, "0") || "00"}` };
}

export type AccountDraft = { externalId: string; name: string; kind: "CHECKING" | "CASH" | "OTHER"; initialBalance: string; openingDate: string | null; active: boolean };

export function mapAccount(row: Row): AccountDraft | null {
  const externalId = clean(row["Código"]);
  const name = truncate(clean(row["Nome"]), 120);
  if (!externalId || !name) return null;
  const t = clean(row["Tipo"]).toLowerCase();
  const kind = t.includes("corrente") ? "CHECKING" : t.includes("caixa") || t.includes("dinheiro") ? "CASH" : "OTHER";
  const money = parseAstreaMoney(row["Valor inicial"]);
  return {
    externalId,
    name,
    kind,
    // saldo inicial negativo não é suportado pelo esquema (conta começa em zero; o relatório avisa)
    initialBalance: money && !money.negative ? money.amount : "0.00",
    openingDate: parseDate(row["Data de início"]),
    active: clean(row["Status"]).toLowerCase() !== "inativo",
  };
}

export type CategoryDraft = { externalId: string; name: string; parentCode: string | null; color: string | null; active: boolean };

export function mapCategory(row: Row): CategoryDraft | null {
  const externalId = clean(row["Código"]);
  const name = truncate(clean(row["Nome"]), 80);
  if (!externalId || !name) return null;
  const color = clean(row["Cor"]);
  return {
    externalId,
    name,
    parentCode: clean(row["Pai"]) || null,
    color: /^#[0-9A-Fa-f]{6}$/.test(color) ? color : null,
    active: clean(row["Status"]).toLowerCase() !== "inativo",
  };
}

export type EntryDraft = {
  externalId: string;
  kind: "RECEIVABLE" | "PAYABLE";
  type: "FEE" | "EXPENSE" | "OTHER";
  description: string;
  notes: string | null;
  amount: string;
  paid: boolean;
  issueDate: string;
  dueDate: string;
  paidOn: string | null;
  accountCode: string;
  categoryCode: string | null;
  costCenterCode: string | null;
  clientCode: string | null;
  caseCode: string | null;
  payeeCode: string | null;
  responsibleCode: string | null;
  installmentNo: number | null;
  installmentTotal: number | null;
  warnings: string[];
};

/** Linhas do Astrea que NÃO viram lançamento, com o motivo (para o relatório). */
export function entrySkipReason(row: Row): string | null {
  if (clean(row["Tipo"]) === "Fatura") return "fatura (agrupador de lançamentos)";
  if (clean(row["Sub-Tipo"]) === "Valor inicial") return "saldo inicial (já vem da conta)";
  return null;
}

/**
 * Entradas.csv → lançamento. `Valores` é o valor efetivo (negativo nas saídas); `Valores Originais` é pouco confiável nas saídas.
 * "Feito" vira lançamento pago INTEGRALMENTE (uma baixa na data de pagamento). "n-m" na descrição = parcela n de m.
 */
export function mapEntry(row: Row): EntryDraft | null {
  const externalId = clean(row["Código"]);
  const tipo = clean(row["Tipo"]);
  if (!externalId || (tipo !== "Entrada" && tipo !== "Saída")) return null;
  const money = parseAstreaMoney(row["Valores"]);
  if (!money || money.amount === "0.00") return null;
  const dueDate = parseDate(row["Data de vencimento"]);
  if (!dueDate) return null;
  const warnings: string[] = [];
  const original = parseAstreaMoney(row["Valores Originais"]);
  const notes: string[] = [];
  if (original && original.amount !== "0.00" && original.amount !== money.amount) {
    notes.push(`Valor original no Astrea: R$ ${original.amount.replace(".", ",")}.`);
    warnings.push("valor pago diferente do original (usado o valor efetivo)");
  }
  const sub = clean(row["Sub-Tipo"]);
  const type = sub === "Honorário" ? "FEE" : sub === "Despesa" ? "EXPENSE" : "OTHER";
  const rawDesc = clean(row["Descrições"]);
  const inst = /^(\d{1,3})-(\d{1,3})$/.exec(rawDesc);
  let installmentNo: number | null = null;
  let installmentTotal: number | null = null;
  let description = rawDesc;
  if (inst && Number(inst[1]) >= 1 && Number(inst[2]) >= Number(inst[1])) {
    installmentNo = Number(inst[1]);
    installmentTotal = Number(inst[2]);
    description = `${type === "FEE" ? "Honorários" : type === "EXPENSE" ? "Despesa" : "Lançamento"} — parcela ${installmentNo}/${installmentTotal}`;
  }
  if (!description) description = type === "FEE" ? "Honorários" : type === "EXPENSE" ? "Despesa" : "Lançamento importado";
  if (description.length > 200) {
    notes.push(`Descrição completa: ${description}`);
    description = truncate(description, 200);
  }
  const status = clean(row["Status"]);
  const paid = status === "Feito";
  const paidOn = paid ? (parseDate(row["Data de pagamento"]) ?? parseDate(row["Dia pago"]) ?? dueDate) : null;
  return {
    externalId,
    kind: tipo === "Entrada" ? "RECEIVABLE" : "PAYABLE",
    type,
    description,
    notes: notes.length ? notes.join("\n") : null,
    amount: money.amount,
    paid,
    issueDate: parseDate(row["Data de lançamento"]) ?? dueDate,
    dueDate,
    paidOn,
    accountCode: clean(row["Conta"]),
    categoryCode: clean(row["Categorias"]) || null,
    costCenterCode: clean(row["Centros de custo"]) || null,
    clientCode: clean(row["Cliente"]) || null,
    caseCode: clean(row["Processo"]) || null,
    payeeCode: tipo === "Saída" ? clean(row["Pago para"]) || null : null,
    responsibleCode: clean(row["Responsável"]) || null,
    installmentNo,
    installmentTotal,
    warnings,
  };
}

// ---------- históricos → andamentos / anotações da linha do tempo ----------

export type HistoryDraft = {
  externalId: string;
  caseCode: string;
  kind: "ANDAMENTO" | "NOTE";
  title: string;
  description: string | null;
  ymd: string;
  hhmm: string;
  userCode: string;
};

/** Tipos de histórico que NÃO viram evento (já existem como tarefas, intimações, prazos e agenda). */
export const HISTORY_SKIPPED_TYPES: Record<string, string> = {
  "Tarefa realizada": "tarefa realizada (já importada como tarefa)",
  Publicação: "publicação (já importada como intimação)",
  Prazo: "prazo (já importado como prazo)",
  Evento: "evento (já importado na agenda)",
  Audiência: "audiência (já importada na agenda)",
  "Atividade excluída": "atividade excluída",
};

/** Linha de "Históricos.csv" → evento da linha do tempo do processo. Só "Andamento" e "Manual" são aproveitados. */
export function mapHistory(r: Row): HistoryDraft | null {
  const externalId = clean(r["Código"]);
  const caseCode = clean(r["Processo"]);
  const type = clean(r["Tipo"]);
  const text = clean(r["Descrição"]);
  const when = parseDateTime(r["Data"]);
  if (!externalId || !caseCode || !text || !when) return null;
  if (type !== "Andamento" && type !== "Manual") return null;
  const firstLine = (text.split(/\r?\n/).find((l) => l.trim()) ?? text).trim();
  const title = truncate(firstLine, 200);
  const multi = text.length > title.length || /\r?\n/.test(text);
  return {
    externalId,
    caseCode,
    kind: type === "Andamento" ? "ANDAMENTO" : "NOTE",
    title,
    description: multi ? truncate(text, 20000) : null,
    ymd: when.ymd,
    hhmm: when.hhmm ?? "12:00",
    userCode: clean(r["Responsável"]),
  };
}

// ---------------- documentos por link (Documentos.csv) ----------------

export type LinkedDocDraft = { externalId: string; name: string; url: string; kind: "GOOGLE_DOCS" | "DRIVE" | "URL"; isModel: boolean; caseCode: string; clientCode: string; userCode: string; originalYmd: string | null };

/** Só entra quem tem link http(s). Anexos de arquivo (DTE_FILE) não têm link: o backup não traz o conteúdo. */
export function mapLinkedDocument(r: Row): LinkedDocDraft | null {
  const externalId = clean(r["Código"]);
  const url = clean(r["Link do documento"]);
  if (!externalId || !/^https:\/\//i.test(url)) return null;
  let host = "";
  try { host = new URL(url).hostname; } catch { return null; }
  const kind = host === "docs.google.com" ? "GOOGLE_DOCS" : host === "drive.google.com" ? "DRIVE" : "URL";
  return {
    externalId,
    name: truncate(clean(r["Descrição"]) || "Documento sem título", 200),
    url: truncate(url, 1000),
    kind,
    isModel: clean(r["Origem"]) === "STANDARD_DOCUMENT_MODEL",
    caseCode: clean(r["Código do processo"]),
    clientCode: clean(r["Código do cliente"]),
    userCode: clean(r["Quem criou"]),
    originalYmd: parseDateTime(r["Data de criação"])?.ymd ?? null,
  };
}
