import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { zonedToUtc } from "@/lib/dates/zoned";
import { iterCsv, parseCsv } from "@/lib/import/csv";
import {
  clean,
  mapCase,
  mapAccount,
  mapCategory,
  mapContact,
  mapEntry,
  entrySkipReason,
  mapDeadline,
  mapEvent,
  mapHearing,
  mapPublication,
  mapTask,
  mapHistory,
  mapLinkedDocument,
  HISTORY_SKIPPED_TYPES,
  partyRoleFromQualification,
  type Row,
} from "@/lib/import/astrea-map";
import { parseNoticeText } from "@/lib/notices/parse";
import { audit } from "@/server/services/audit.service";

export const SOURCE = "astrea";
export const ENTITIES = ["clientes", "processos", "prazos", "tarefas", "agenda", "intimacoes", "andamentos", "documentos", "financeiro"] as const;
export type ImportEntity = (typeof ENTITIES)[number];

export type EntityReport = { lidos: number; importados: number; jaImportados: number; ignorados: Record<string, number>; avisos: Record<string, number> };
export type ImportReport = {
  dryRun: boolean;
  organizationId: string;
  entidades: Partial<Record<ImportEntity, EntityReport>>;
  naoImportado: string[];
  usuariosSemVinculo: number;
};

export type ImportOptions = {
  organizationId: string;
  importerUserId: string;
  dir: string;
  dryRun?: boolean;
  only?: ImportEntity[];
  timezone?: string;
  log?: (msg: string) => void;
};

const nfc = (s: string) => s.normalize("NFC");

function readCsv(dir: string, name: string): Row[] {
  const wanted = nfc(`${name}.csv`);
  const file = fs.readdirSync(dir).find((f) => nfc(f) === wanted);
  if (!file) return [];
  return parseCsv(fs.readFileSync(path.join(dir, file), "utf8"));
}

const rep = (): EntityReport => ({ lidos: 0, importados: 0, jaImportados: 0, ignorados: {}, avisos: {} });
const bump = (o: Record<string, number>, k: string, n = 1) => {
  o[k] = (o[k] ?? 0) + n;
};
const dateAt = (ymd: string) => new Date(`${ymd}T12:00:00Z`);
const dateOnly = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function loadMap(organizationId: string, entity: string): Promise<Map<string, string>> {
  const rows = await db.importMap.findMany({ where: { organizationId, source: SOURCE, entity }, select: { externalId: true, internalId: true } });
  return new Map(rows.map((r) => [r.externalId, r.internalId]));
}

/**
 * Importa o backup completo (CSV) do Astrea para UM escritório. Idempotente: códigos já importados são pulados
 * (tabela import_map). Em `dryRun` nada é gravado; o relatório mostra o que aconteceria.
 * Não importa: documentos (o backup só traz links), histórico/andamentos e comentários soltos.
 */
export async function runAstreaImport(opts: ImportOptions): Promise<ImportReport> {
  const { organizationId, importerUserId, dir, dryRun = false } = opts;
  const tz = opts.timezone ?? "America/Sao_Paulo";
  const log = opts.log ?? (() => undefined);
  const only = new Set<ImportEntity>(opts.only?.length ? opts.only : ENTITIES);
  const report: ImportReport = { dryRun, organizationId, entidades: {}, naoImportado: [], usuariosSemVinculo: 0 };

  const member = await db.membership.findFirst({ where: { organizationId, userId: importerUserId, status: "ACTIVE" }, select: { id: true } });
  if (!member) throw new Error("O usuário informado não é membro ativo do escritório.");

  // ---- usuários do Astrea → membros do escritório (pelo e-mail de login) ----
  const members = await db.membership.findMany({ where: { organizationId, status: "ACTIVE" }, select: { userId: true, user: { select: { email: true } } } });
  const byEmail = new Map(members.map((m) => [m.user.email.toLowerCase(), m.userId]));
  const userByCode = new Map<string, string>();
  let unlinked = 0;
  for (const u of readCsv(dir, "Usuário")) {
    if (clean(u["Tipo"]) !== "Usuário") continue; // "Cliente" = acesso de cliente ao portal do Astrea
    const id = byEmail.get(clean(u["Login"]).toLowerCase());
    if (id) userByCode.set(clean(u["Código"]), id);
    else unlinked++;
  }
  report.usuariosSemVinculo = unlinked;
  const who = (code: string) => userByCode.get(code) ?? importerUserId;

  const qualificationType = new Map(readCsv(dir, "Qualificações").map((q) => [clean(q["Código"]), clean(q["Tipo"])]));

  const contactRows = readCsv(dir, "Contatos");
  const contactsByCode = new Map(contactRows.map((c) => [clean(c["Código"]), c]));
  const caseRows = readCsv(dir, "Processos");

  // ======================= CLIENTES =======================
  const clientMap = await loadMap(organizationId, "client");
  if (only.has("clientes") || only.has("processos")) {
    const r = rep();
    report.entidades.clientes = r;
    const referenced = new Set<string>();
    for (const row of caseRows) {
      const c = mapCase(row);
      c?.clientCodes.forEach((x) => referenced.add(x));
    }
    const wanted = contactRows.filter((c) => clean(c["Classificação"]) === "Cliente" || referenced.has(clean(c["Código"])));
    r.lidos = wanted.length;
    const existingDocs = new Set((await db.client.findMany({ where: { organizationId, deletedAt: null, document: { not: null } }, select: { document: true } })).map((c) => c.document as string));
    const clientRows: Prisma.ClientCreateManyInput[] = [];
    const mapRows: { organizationId: string; source: string; entity: string; externalId: string; internalId: string }[] = [];
    for (const row of wanted) {
      const d = mapContact(row);
      if (!d) {
        bump(r.ignorados, "sem nome ou código");
        continue;
      }
      if (clientMap.has(d.externalId)) {
        r.jaImportados++;
        continue;
      }
      let document = d.document;
      let notes = d.notes;
      if (document && existingDocs.has(document)) {
        notes = [notes, `Atenção: CPF/CNPJ ${document} já existe em outro cadastro deste escritório (não repetido aqui).`].filter(Boolean).join("\n\n");
        document = null;
        bump(r.avisos, "documento repetido (ficou sem CPF/CNPJ)");
      }
      if (document) existingDocs.add(document);
      if (d.warnings.length) bump(r.avisos, "CPF/CNPJ inválido (guardado nas observações)", 1);
      const id = randomUUID();
      clientMap.set(d.externalId, id);
      clientRows.push({
        id,
        organizationId,
        type: d.type,
        status: "ACTIVE",
        name: d.name,
        tradeName: d.tradeName,
        document,
        email: d.email,
        phone: d.phone,
        birthDate: d.birthDate ? dateOnly(d.birthDate) : null,
        tags: ["astrea"],
        notes,
        addressZip: d.addressZip,
        addressStreet: d.addressStreet,
        addressNumber: d.addressNumber,
        addressComplement: d.addressComplement,
        addressDistrict: d.addressDistrict,
        addressCity: d.addressCity,
        addressState: d.addressState,
        createdById: importerUserId,
      });
      mapRows.push({ organizationId, source: SOURCE, entity: "client", externalId: d.externalId, internalId: id });
      r.importados++;
    }
    if (!dryRun) {
      for (const part of chunks(clientRows, 500)) {
        const ids = new Set(part.map((p) => p.id as string));
        await db.$transaction([db.client.createMany({ data: part }), db.importMap.createMany({ data: mapRows.filter((m) => ids.has(m.internalId)) })]);
      }
    }
    log(`clientes: ${r.importados} novos, ${r.jaImportados} já importados`);
  }

  // ======================= PROCESSOS =======================
  const caseMap = await loadMap(organizationId, "case");
  if (only.has("processos")) {
    const r = rep();
    report.entidades.processos = r;
    r.lidos = caseRows.length;
    const existingNumbers = new Set((await db.case.findMany({ where: { organizationId, deletedAt: null, number: { not: null } }, select: { number: true } })).map((c) => c.number as string));
    type Pack = { id: string; ext: string; data: Record<string, unknown>; parties: Record<string, unknown>[]; members: Record<string, unknown>[]; createdAt: Date };
    const packs: Pack[] = [];
    for (const row of caseRows) {
      const d = mapCase(row);
      if (!d) {
        bump(r.ignorados, clean(row["Tipo"]) === "Atendimento" ? "atendimento (não é processo)" : "tipo/título inválido");
        continue;
      }
      if (caseMap.has(d.externalId)) {
        r.jaImportados++;
        continue;
      }
      let number = d.number;
      let legacy = d.legacyNumber;
      if (number && existingNumbers.has(number)) {
        legacy = number;
        number = null;
        bump(r.avisos, "número CNJ repetido (guardado como número antigo)");
      }
      if (number) existingNumbers.add(number);
      const id = randomUUID();
      const createdAt = d.createdAt ? dateAt(d.createdAt) : new Date();
      const parties: Record<string, unknown>[] = [];
      const seenClients = new Set<string>();
      d.clientCodes.forEach((code, i) => {
        const cid = clientMap.get(code);
        const c = contactsByCode.get(code);
        if (!c || seenClients.has(code)) return;
        seenClients.add(code);
        const role = partyRoleFromQualification(qualificationType.get(d.clientQualificationCodes[i] ?? ""));
        parties.push({ organizationId, caseId: id, clientId: cid ?? null, role: role === "OTHER" || role === "THIRD_PARTY" ? "PLAINTIFF" : role, name: clean(c["Nome"]).slice(0, 200), isOurClient: true });
      });
      d.partyCodes.forEach((code, i) => {
        if (seenClients.has(code)) return;
        const c = contactsByCode.get(code);
        if (!c) return;
        seenClients.add(code);
        const cid = clientMap.get(code);
        const role = partyRoleFromQualification(qualificationType.get(d.partyQualificationCodes[i] ?? ""));
        parties.push({ organizationId, caseId: id, clientId: cid ?? null, role, name: clean(c["Nome"]).slice(0, 200), isOurClient: Boolean(cid) });
      });
      const respUser = who(d.responsibleCode);
      const memberSet = new Map<string, "RESPONSIBLE" | "COLLABORATOR">([[respUser, "RESPONSIBLE"]]);
      for (const code of d.userCodes) {
        const u = userByCode.get(code);
        if (u && !memberSet.has(u)) memberSet.set(u, "COLLABORATOR");
      }
      packs.push({
        id,
        ext: d.externalId,
        createdAt,
        data: {
          id,
          organizationId,
          number,
          nature: number ? "JUDICIAL" : "CASE",
          legacyNumber: legacy,
          title: d.title,
          courtUnit: d.courtUnit,
          status: d.status,
          phase: d.phase,
          distributedAt: d.distributedAt ? dateOnly(d.distributedAt) : null,
          confidential: false,
          notes: d.notes,
          createdById: importerUserId,
          createdAt,
        },
        parties,
        members: [...memberSet].map(([userId, role]) => ({ organizationId, caseId: id, userId, role })),
      });
      caseMap.set(d.externalId, id);
      r.importados++;
    }
    if (!dryRun) {
      for (const part of chunks(packs, 300)) {
        await db.$transaction([
          db.case.createMany({ data: part.map((p) => p.data) as never }),
          db.caseParty.createMany({ data: part.flatMap((p) => p.parties) as never }),
          db.caseMember.createMany({ data: part.flatMap((p) => p.members) as never }),
          db.caseEvent.createMany({
            data: part.map((p) => ({ organizationId, caseId: p.id, source: "IMPORTED" as const, kind: "IMPORT", title: "Importado do Astrea", occurredAt: p.createdAt, createdById: importerUserId })),
          }),
          db.importMap.createMany({ data: part.map((p) => ({ organizationId, source: SOURCE, entity: "case", externalId: p.ext, internalId: p.id })) }),
        ]);
      }
    }
    log(`processos: ${r.importados} novos, ${r.jaImportados} já importados`);
  }

  // ======================= PRAZOS =======================
  if (only.has("prazos")) {
    const r = rep();
    report.entidades.prazos = r;
    const rows = readCsv(dir, "Prazos");
    r.lidos = rows.length;
    const done = await loadMap(organizationId, "deadline");
    const data: Record<string, unknown>[] = [];
    const maps: { organizationId: string; source: string; entity: string; externalId: string; internalId: string }[] = [];
    for (const row of rows) {
      const d = mapDeadline(row);
      if (!d) {
        bump(r.ignorados, "sem data, nome ou processo");
        continue;
      }
      if (done.has(d.externalId)) {
        r.jaImportados++;
        continue;
      }
      const caseId = caseMap.get(d.caseCode);
      if (!caseId) {
        bump(r.ignorados, "processo não importado");
        continue;
      }
      const id = randomUUID();
      const changed = d.changedAt ? dateAt(d.changedAt) : new Date();
      data.push({
        id,
        organizationId,
        caseId,
        title: d.title,
        source: "IMPORTED",
        status: d.status,
        dueDate: dateOnly(d.dueDate),
        responsibleId: who(d.responsibleCode),
        notes: d.notes,
        validatedById: d.status === "FULFILLED" ? importerUserId : null,
        validatedAt: d.status === "FULFILLED" ? changed : null,
        fulfilledAt: d.status === "FULFILLED" ? changed : null,
        createdById: importerUserId,
      });
      maps.push({ organizationId, source: SOURCE, entity: "deadline", externalId: d.externalId, internalId: id });
      r.importados++;
      if (d.status === "DRAFT") bump(r.avisos, "prazo pendente entrou como RASCUNHO (precisa de validação humana)");
    }
    if (!dryRun) for (const part of chunks(data, 500)) {
      const ids = new Set(part.map((p) => p.id as string));
      await db.$transaction([db.deadline.createMany({ data: part as never }), db.importMap.createMany({ data: maps.filter((m) => ids.has(m.internalId)) })]);
    }
    log(`prazos: ${r.importados} novos`);
  }

  // ======================= TAREFAS =======================
  if (only.has("tarefas")) {
    const r = rep();
    report.entidades.tarefas = r;
    const rows = readCsv(dir, "Tarefas");
    r.lidos = rows.length;
    const done = await loadMap(organizationId, "task");
    const data: Record<string, unknown>[] = [];
    const maps: { organizationId: string; source: string; entity: string; externalId: string; internalId: string }[] = [];
    for (const row of rows) {
      const d = mapTask(row);
      if (!d) {
        bump(r.ignorados, "sem descrição");
        continue;
      }
      if (done.has(d.externalId)) {
        r.jaImportados++;
        continue;
      }
      const caseId = d.caseCode ? caseMap.get(d.caseCode) : undefined;
      let description = d.description;
      if (d.caseCode && !caseId) {
        description = [description, `Processo do Astrea (código ${d.caseCode}) não foi importado.`].filter(Boolean).join("\n\n");
        bump(r.avisos, "tarefa sem processo (processo não importado)");
      }
      const id = randomUUID();
      data.push({
        id,
        organizationId,
        title: d.title,
        description,
        status: d.done ? "DONE" : "TODO",
        priority: d.priority,
        dueDate: d.dueDate ? dateOnly(d.dueDate) : null,
        assigneeId: who(d.assigneeCode),
        caseId: caseId ?? null,
        createdById: importerUserId,
        completedAt: d.done ? dateAt(d.completedAt ?? d.dueDate ?? d.createdAt ?? new Date().toISOString().slice(0, 10)) : null,
        createdAt: d.createdAt ? dateAt(d.createdAt) : new Date(),
      });
      maps.push({ organizationId, source: SOURCE, entity: "task", externalId: d.externalId, internalId: id });
      r.importados++;
    }
    if (!dryRun) for (const part of chunks(data, 1000)) {
      const ids = new Set(part.map((p) => p.id as string));
      await db.$transaction([db.task.createMany({ data: part as never }), db.importMap.createMany({ data: maps.filter((m) => ids.has(m.internalId)) })]);
    }
    log(`tarefas: ${r.importados} novas`);
  }

  // ======================= AGENDA =======================
  if (only.has("agenda")) {
    const r = rep();
    report.entidades.agenda = r;
    const rows: { entity: string; d: ReturnType<typeof mapHearing> }[] = [
      ...readCsv(dir, "Audiências").map((x) => ({ entity: "hearing", d: mapHearing(x) })),
      ...readCsv(dir, "Eventos").map((x) => ({ entity: "event", d: mapEvent(x) })),
    ];
    r.lidos = rows.length;
    const doneKeys = new Set((await db.importMap.findMany({ where: { organizationId, source: SOURCE, entity: { in: ["hearing", "event"] } }, select: { entity: true, externalId: true } })).map((x) => `${x.entity}:${x.externalId}`));
    const data: Record<string, unknown>[] = [];
    const maps: { organizationId: string; source: string; entity: string; externalId: string; internalId: string }[] = [];
    for (const { entity, d } of rows) {
      if (!d) {
        bump(r.ignorados, "sem data ou descrição");
        continue;
      }
      if (doneKeys.has(`${entity}:${d.externalId}`)) {
        r.jaImportados++;
        continue;
      }
      if (d.canceled) {
        bump(r.ignorados, "cancelado no Astrea");
        continue;
      }
      const startsAt = zonedToUtc(d.startYmd, d.startHhmm ?? "00:00", tz);
      let endsAt: Date | null = d.endYmd && d.endHhmm ? zonedToUtc(d.endYmd, d.endHhmm, tz) : null;
      if (endsAt && endsAt < startsAt) endsAt = null;
      const id = randomUUID();
      data.push({
        id,
        organizationId,
        title: d.title,
        kind: d.kind,
        startsAt,
        endsAt,
        allDay: d.allDay,
        location: d.location,
        description: d.description,
        caseId: d.caseCode ? (caseMap.get(d.caseCode) ?? null) : null,
        createdById: importerUserId,
      });
      maps.push({ organizationId, source: SOURCE, entity, externalId: d.externalId, internalId: id });
      r.importados++;
    }
    if (!dryRun) for (const part of chunks(data, 1000)) {
      const ids = new Set(part.map((p) => p.id as string));
      await db.$transaction([db.agendaEvent.createMany({ data: part as never }), db.importMap.createMany({ data: maps.filter((m) => ids.has(m.internalId)) })]);
    }
    log(`agenda: ${r.importados} novos`);
  }

  // ======================= INTIMAÇÕES =======================
  if (only.has("intimacoes")) {
    const r = rep();
    report.entidades.intimacoes = r;
    const rows = readCsv(dir, "Publicações");
    r.lidos = rows.length;
    const done = await loadMap(organizationId, "notice");
    const data: Record<string, unknown>[] = [];
    const maps: { organizationId: string; source: string; entity: string; externalId: string; internalId: string }[] = [];
    const today = new Date().toISOString().slice(0, 10);
    for (const row of rows) {
      const d = mapPublication(row);
      if (!d) {
        bump(r.ignorados, "sem texto");
        continue;
      }
      if (done.has(d.externalId)) {
        r.jaImportados++;
        continue;
      }
      const parsed = parseNoticeText(d.content);
      const id = randomUUID();
      const received = d.receivedAt ?? today;
      data.push({
        id,
        organizationId,
        source: "IMPORTED",
        status: d.status,
        kind: parsed.kind ?? "INTIMACAO",
        title: d.title,
        content: d.content,
        caseNumber: parsed.caseNumber,
        court: d.court,
        publishedAt: d.publishedAt ? dateOnly(d.publishedAt) : null,
        receivedAt: dateOnly(received),
        caseId: d.caseCode ? (caseMap.get(d.caseCode) ?? null) : null,
        contentHash: d.contentHash,
        discardReason: d.status === "DISCARDED" ? "Rejeitada no Astrea (importada)." : null,
        processedAt: d.status === "PROCESSED" ? dateAt(received) : null,
        processedById: d.status === "PROCESSED" ? importerUserId : null,
        createdById: importerUserId,
      });
      maps.push({ organizationId, source: SOURCE, entity: "notice", externalId: d.externalId, internalId: id });
      r.importados++;
    }
    if (!dryRun) for (const part of chunks(data, 300)) {
      const ids = new Set(part.map((p) => p.id as string));
      await db.$transaction([db.courtNotice.createMany({ data: part as never }), db.importMap.createMany({ data: maps.filter((m) => ids.has(m.internalId)) })]);
    }
    log(`intimações: ${r.importados} novas`);
  }


  // ======================= ANDAMENTOS (Históricos.csv) =======================
  if (only.has("andamentos")) {
    const r = rep();
    report.entidades.andamentos = r;
    const histFile = fs.readdirSync(dir).find((f) => nfc(f) === nfc("Históricos.csv"));
    const done = await loadMap(organizationId, "history");
    type EventRow = Prisma.CaseEventCreateManyInput;
    let events: EventRow[] = [];
    let maps: { organizationId: string; source: string; entity: string; externalId: string; internalId: string }[] = [];
    let gravados = 0;
    const flush = async () => {
      if (!events.length) return;
      if (!dryRun) {
        await db.$transaction([db.caseEvent.createMany({ data: events }), db.importMap.createMany({ data: maps })]);
        gravados += events.length;
        log(`andamentos: ${gravados} gravados`);
      }
      events = [];
      maps = [];
    };
    // Lê o arquivo em fluxo (é o maior do backup) e grava em lotes: memória constante.
    if (histFile) for await (const row of iterCsv(path.join(dir, histFile))) {
      r.lidos++;
      const type = clean(row["Tipo"]);
      const skipped = HISTORY_SKIPPED_TYPES[type];
      if (skipped) {
        bump(r.ignorados, skipped);
        continue;
      }
      const d = mapHistory(row);
      if (!d) {
        bump(r.ignorados, "sem texto, data ou processo");
        continue;
      }
      if (done.has(d.externalId)) {
        r.jaImportados++;
        continue;
      }
      const caseId = caseMap.get(d.caseCode);
      if (!caseId) {
        bump(r.ignorados, "processo não importado (atendimento ou fora do backup)");
        continue;
      }
      const id = randomUUID();
      r.importados++;
      if (dryRun) continue; // simulação: só conta
      events.push({
        id,
        organizationId,
        caseId,
        source: "IMPORTED",
        kind: d.kind,
        title: d.title,
        description: d.description,
        occurredAt: zonedToUtc(d.ymd, d.hhmm, tz),
        createdById: d.userCode ? (userByCode.get(d.userCode) ?? null) : null,
      });
      maps.push({ organizationId, source: SOURCE, entity: "history", externalId: d.externalId, internalId: id });
      if (events.length >= 2000) await flush();
    }
    await flush();
    log(`andamentos: ${r.importados} novos, ${r.jaImportados} já importados`);
  }

  // ======================= DOCUMENTOS (links; Documentos.csv) =======================
  if (only.has("documentos")) {
    const r = rep();
    report.entidades.documentos = r;
    const done = await loadMap(organizationId, "linked_doc");
    const rows: Prisma.LinkedDocumentCreateManyInput[] = [];
    const maps: { organizationId: string; source: string; entity: string; externalId: string; internalId: string }[] = [];
    for (const row of readCsv(dir, "Documentos")) {
      r.lidos++;
      const d = mapLinkedDocument(row);
      if (!d) {
        bump(r.ignorados, "arquivo anexado sem link (o backup não traz o conteúdo)");
        continue;
      }
      if (done.has(d.externalId)) {
        r.jaImportados++;
        continue;
      }
      const caseId = d.caseCode ? (caseMap.get(d.caseCode) ?? null) : null;
      const clientId = d.clientCode ? (clientMap.get(d.clientCode) ?? null) : null;
      if (!d.isModel && !caseId && !clientId) {
        bump(r.ignorados, "sem processo ou cliente importado");
        continue;
      }
      const id = randomUUID();
      r.importados++;
      rows.push({ id, organizationId, caseId, clientId: caseId ? null : clientId, name: d.name, url: d.url, kind: d.kind, isModel: d.isModel, source: "ASTREA", originalAt: d.originalYmd ? dateAt(d.originalYmd) : null, createdById: d.userCode ? (userByCode.get(d.userCode) ?? null) : null });
      maps.push({ organizationId, source: SOURCE, entity: "linked_doc", externalId: d.externalId, internalId: id });
    }
    if (!dryRun) {
      for (const part of chunks(rows, 500)) {
        const ids = new Set(part.map((p) => p.id));
        await db.$transaction([db.linkedDocument.createMany({ data: part }), db.importMap.createMany({ data: maps.filter((m) => ids.has(m.internalId)) })]);
      }
    }
    log(`documentos: ${r.importados} links novos`);
  }

  // ======================= FINANCEIRO =======================
  if (only.has("financeiro")) {
    const r = rep();
    report.entidades.financeiro = r;
    const base = { organizationId, source: SOURCE };
    type MapRow = { organizationId: string; source: string; entity: string; externalId: string; internalId: string };

    // --- contas ---
    const accountMap = await loadMap(organizationId, "fin_account");
    const existingAccounts = new Map((await db.financeAccount.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true } })).map((a) => [a.name.toLowerCase(), a.id]));
    const accData: Prisma.FinanceAccountCreateManyInput[] = [];
    const accMaps: MapRow[] = [];
    for (const row of readCsv(dir, "Contas")) {
      const d = mapAccount(row);
      if (!d) continue;
      if (accountMap.has(d.externalId)) continue;
      const found = existingAccounts.get(d.name.toLowerCase());
      if (found) {
        accountMap.set(d.externalId, found);
        accMaps.push({ ...base, entity: "fin_account", externalId: d.externalId, internalId: found });
        bump(r.avisos, "conta já existia (vinculada, saldo inicial não alterado)");
        continue;
      }
      const id = randomUUID();
      accountMap.set(d.externalId, id);
      existingAccounts.set(d.name.toLowerCase(), id);
      accData.push({ id, organizationId, name: d.name, kind: d.kind, initialBalance: d.initialBalance, openingDate: d.openingDate ? dateOnly(d.openingDate) : null, active: d.active });
      accMaps.push({ ...base, entity: "fin_account", externalId: d.externalId, internalId: id });
    }
    // --- categorias ---
    const categoryMap = await loadMap(organizationId, "fin_category");
    const existingCats = new Map((await db.financeCategory.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true } })).map((c) => [c.name.toLowerCase(), c.id]));
    const catRows = readCsv(dir, "Categorias").map(mapCategory).filter((c): c is NonNullable<ReturnType<typeof mapCategory>> => !!c);
    const catName = new Map(catRows.map((c) => [c.externalId, c.name]));
    const catData: Prisma.FinanceCategoryCreateManyInput[] = [];
    const catMaps: MapRow[] = [];
    for (const d of catRows) {
      if (categoryMap.has(d.externalId)) continue;
      const parent = d.parentCode ? catName.get(d.parentCode) : null;
      const name = (parent ? `${parent} › ${d.name}` : d.name).slice(0, 80);
      const found = existingCats.get(name.toLowerCase());
      if (found) {
        categoryMap.set(d.externalId, found);
        catMaps.push({ ...base, entity: "fin_category", externalId: d.externalId, internalId: found });
        continue;
      }
      const id = randomUUID();
      categoryMap.set(d.externalId, id);
      existingCats.set(name.toLowerCase(), id);
      catData.push({ id, organizationId, name, color: d.color, active: d.active });
      catMaps.push({ ...base, entity: "fin_category", externalId: d.externalId, internalId: id });
    }
    // --- centros de custo ---
    const ccMap = await loadMap(organizationId, "fin_cost_center");
    const existingCc = new Map((await db.costCenter.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true } })).map((c) => [c.name.toLowerCase(), c.id]));
    const ccData: Prisma.CostCenterCreateManyInput[] = [];
    const ccMaps: MapRow[] = [];
    for (const row of readCsv(dir, "Centros de custo")) {
      const code = clean(row["Código"]);
      const name = clean(row["Nome"]).slice(0, 80);
      if (!code || !name || ccMap.has(code)) continue;
      const found = existingCc.get(name.toLowerCase());
      if (found) {
        ccMap.set(code, found);
        ccMaps.push({ ...base, entity: "fin_cost_center", externalId: code, internalId: found });
        continue;
      }
      const id = randomUUID();
      ccMap.set(code, id);
      existingCc.set(name.toLowerCase(), id);
      ccData.push({ id, organizationId, name, active: clean(row["Status"]).toLowerCase() !== "inativo" });
      ccMaps.push({ ...base, entity: "fin_cost_center", externalId: code, internalId: id });
    }
    if (!dryRun) {
      await db.$transaction([
        db.financeAccount.createMany({ data: accData }),
        db.financeCategory.createMany({ data: catData }),
        db.costCenter.createMany({ data: ccData }),
        db.importMap.createMany({ data: [...accMaps, ...catMaps, ...ccMaps] }),
      ]);
    }
    log(`financeiro: ${accData.length} contas, ${catData.length} categorias, ${ccData.length} centros de custo novos`);

    // --- lançamentos + baixas ---
    const entryMap = await loadMap(organizationId, "fin_entry");
    const entryRows = readCsv(dir, "Entradas");
    r.lidos = entryRows.length;
    const onlyAccount = accountMap.size === 1 ? [...accountMap.values()][0]! : null;
    type Pack = { entry: Prisma.FinanceEntryCreateManyInput; payment: Prisma.FinancePaymentCreateManyInput | null; map: MapRow };
    const packs: Pack[] = [];
    for (const row of entryRows) {
      const skip = entrySkipReason(row);
      if (skip) {
        bump(r.ignorados, skip);
        continue;
      }
      const d = mapEntry(row);
      if (!d) {
        bump(r.ignorados, "tipo, valor (zero) ou vencimento inválido");
        continue;
      }
      if (entryMap.has(d.externalId)) {
        r.jaImportados++;
        continue;
      }
      const accountId = accountMap.get(d.accountCode) ?? onlyAccount;
      if (d.paid && !accountId) {
        bump(r.ignorados, "baixa sem conta conhecida");
        continue;
      }
      for (const w of d.warnings) bump(r.avisos, w);
      const clientId = d.clientCode ? (clientMap.get(d.clientCode) ?? null) : null;
      if (d.clientCode && !clientId) bump(r.avisos, "cliente não importado (lançamento ficou sem cliente)");
      const caseId = d.caseCode ? (caseMap.get(d.caseCode) ?? null) : null;
      if (d.caseCode && !caseId) bump(r.avisos, "processo não importado (lançamento ficou sem processo)");
      const counterparty = d.payeeCode ? ((contactsByCode.get(d.payeeCode) ? clean(contactsByCode.get(d.payeeCode)?.["Nome"]) : "") || null) : null;
      const createdById = d.responsibleCode ? who(d.responsibleCode) : importerUserId;
      const id = randomUUID();
      packs.push({
        entry: {
          id,
          organizationId,
          kind: d.kind,
          type: d.type,
          status: d.paid ? "PAID" : "OPEN",
          description: d.description,
          amount: d.amount,
          paidAmount: d.paid ? d.amount : "0.00",
          issueDate: dateOnly(d.issueDate),
          dueDate: dateOnly(d.dueDate),
          accountId: accountId ?? null,
          categoryId: d.categoryCode ? (categoryMap.get(d.categoryCode) ?? null) : null,
          costCenterId: d.costCenterCode ? (ccMap.get(d.costCenterCode) ?? null) : null,
          clientId,
          caseId,
          counterparty: counterparty ? counterparty.slice(0, 160) : null,
          notes: d.notes,
          installmentNo: d.installmentNo,
          installmentTotal: d.installmentTotal,
          createdById,
        },
        payment: d.paid && accountId && d.paidOn ? { id: randomUUID(), organizationId, entryId: id, accountId, amount: d.amount, paidOn: dateOnly(d.paidOn), method: null, note: "Importado do Astrea", createdById } : null,
        map: { ...base, entity: "fin_entry", externalId: d.externalId, internalId: id },
      });
      r.importados++;
    }
    if (!dryRun) {
      for (const part of chunks(packs, 500)) {
        await db.$transaction([
          db.financeEntry.createMany({ data: part.map((p) => p.entry) }),
          db.financePayment.createMany({ data: part.flatMap((p) => (p.payment ? [p.payment] : [])) }),
          db.importMap.createMany({ data: part.map((p) => p.map) }),
        ]);
      }
    }
    log(`financeiro: ${r.importados} lançamentos novos (${packs.filter((p) => p.payment).length} com baixa)`);
  }

  report.naoImportado = [
    "Documentos: entram só os que têm link (Google Docs, Drive, URL), como links. Arquivos anexados no Astrea não vêm no backup.",
    "Financeiro: faturas (agrupadores) e a planilha Honorários/Despesas (espelham as Entradas); transferências entre contas (vazias no backup).",
    "Comentários avulsos, timesheets e listas de tarefa. Do histórico só entram andamentos e anotações manuais (o resto já existe como tarefas, prazos, intimações e agenda).",
    "Contatos que não são clientes nem partes de processos importados.",
  ];
  if (!dryRun) {
    await audit({ action: "import.astrea", organizationId, userId: importerUserId, resourceType: "organization", resourceId: organizationId, metadata: { entidades: Object.fromEntries(Object.entries(report.entidades).map(([k, v]) => [k, { importados: v.importados, jaImportados: v.jaImportados }])) } });
  }
  return report;
}
