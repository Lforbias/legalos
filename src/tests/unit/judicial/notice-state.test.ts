import { describe, expect, it } from "vitest";
import { actionOfStored, describeNoticeEvent, noticeStates, NOTICE_ACTIONS, storedEvent, type NoticeStateInput } from "@/lib/judicial/notice-state";

const base: NoticeStateInput = { originKind: "DJEN_PUBLICATION", firstViewedAt: null, officialAckAt: null, officialAckState: "NOT_APPLICABLE", status: "NEW", assigneeId: null, teamId: null };
const byKey = (n: NoticeStateInput) => Object.fromEntries(noticeStates(n).map((c) => [c.key, c]));
const none = { actor: null, to: null, team: null, caseTitle: null };

describe("estados da comunicação (capturada ≠ vista ≠ ciência oficial ≠ distribuída ≠ tratada)", () => {
  it("sempre devolve os cinco estados, em ordem, cada um independente", () => {
    expect(noticeStates(base).map((c) => c.key)).toEqual(["capture", "viewed", "official", "assignment", "treatment"]);
  });

  it("publicação do DJEN recém-capturada: não vista, sem ciência a registrar, sem responsável, em aberto", () => {
    const s = byKey(base);
    expect(s.capture!.label).toBe("Capturada do DJEN");
    expect(s.viewed).toMatchObject({ label: "Não vista no LegalOS", tone: "warning" });
    expect(s.official!.label).toBe("Sem ciência oficial a registrar");
    expect(s.assignment).toMatchObject({ label: "Sem responsável", tone: "warning" });
    expect(s.treatment).toMatchObject({ label: "Em aberto", tone: "warning" });
  });

  it("abrir no LegalOS NUNCA vira ciência oficial: comunicação privada vista continua 'não confirmada'", () => {
    const s = byKey({ ...base, originKind: "PRIVATE_COMMUNICATION", officialAckState: "UNKNOWN", firstViewedAt: new Date() });
    expect(s.viewed!.label).toBe("Vista no LegalOS");
    expect(s.official!.label).toBe("Ciência oficial não confirmada");
    expect(s.official!.tone).toBe("warning");
    expect(s.official!.detail).toMatch(/não registra ciência no tribunal/i);
    expect(JSON.stringify(noticeStates({ ...base, originKind: "PRIVATE_COMMUNICATION", officialAckState: "UNKNOWN", firstViewedAt: new Date() }))).not.toMatch(/Ciência oficial registrada/);
  });

  it("ciência oficial só aparece como registrada quando a fonte confirmou (officialAckAt)", () => {
    const s = byKey({ ...base, originKind: "PRIVATE_COMMUNICATION", officialAckState: "UNKNOWN", officialAckAt: new Date() });
    expect(s.official).toMatchObject({ label: "Ciência oficial registrada", tone: "success" });
    expect(s.viewed!.label).toBe("Não vista no LegalOS"); // ciência oficial não implica vista no LegalOS
    expect(byKey({ ...base, originKind: "PRIVATE_COMMUNICATION", officialAckState: "ACKNOWLEDGED" }).official!.label).toBe("Ciência oficial registrada");
    expect(byKey({ ...base, originKind: "PRIVATE_COMMUNICATION", officialAckState: "PENDING" }).official!.label).toBe("Ciência oficial pendente");
  });

  it("distribuída e tratada são estados próprios", () => {
    expect(byKey({ ...base, status: "DISTRIBUTED", assigneeId: "u1" }).assignment!.label).toBe("Distribuída");
    expect(byKey({ ...base, status: "DISTRIBUTED", teamId: "t1" }).assignment!.label).toBe("Distribuída");
    const done = byKey({ ...base, status: "PROCESSED", assigneeId: "u1", firstViewedAt: new Date() });
    expect(done.treatment).toMatchObject({ label: "Tratada internamente", tone: "success" });
    expect(byKey({ ...base, status: "DISCARDED" }).treatment!.label).toBe("Descartada");
    // encerrada não pede mais atenção: "não vista"/"sem responsável" deixam de ser avisos
    expect(byKey({ ...base, status: "DISCARDED" }).viewed!.tone).toBe("neutral");
    expect(byKey({ ...base, status: "DISCARDED" }).assignment!.tone).toBe("neutral");
  });

  it("registro manual e importação de histórico têm rótulos próprios", () => {
    expect(byKey({ ...base, originKind: null }).capture!.label).toBe("Registro manual ou importação");
    expect(byKey({ ...base, originKind: "IMPORT" }).capture!.label).toBe("Histórico importado");
    expect(byKey({ ...base, originKind: "PROCESS_MOVEMENT" }).capture!.label).toBe("Movimentação capturada");
  });
});

describe("linha do tempo (frases em português simples)", () => {
  it("VIEWED explica que não é ciência no tribunal", () => {
    const e = describeNoticeEvent("VIEWED", {}, { ...none, actor: "Dra. Ana" });
    expect(e.title).toBe("Vista no LegalOS por Dra. Ana");
    expect(e.detail).toMatch(/não registra ciência no tribunal/i);
  });

  it("CAPTURED mostra origem, fonte e identificador oficial", () => {
    const e = describeNoticeEvent("CAPTURED", { origin: "DJEN_PUBLICATION", source: "djen", officialId: "991" }, none);
    expect(e.title).toContain("Publicação no DJEN");
    expect(e.detail).toBe("Fonte: djen · Identificador oficial: 991");
  });

  it("distribuição, equipe, devolução, sono, tratamento, descarte e reabertura", () => {
    expect(describeNoticeEvent("ASSIGNED", { to: "u", action: "assigned" }, { ...none, to: "Bia", actor: "Ana" })).toMatchObject({ title: "Distribuída para Bia", detail: "Por Ana." });
    expect(describeNoticeEvent("ASSIGNED", { action: "team_assigned" }, { ...none, team: "Prazos" }).title).toBe("Distribuída para a equipe Prazos");
    expect(describeNoticeEvent("ASSIGNED", { action: "returned" }, none).title).toBe("Devolvida à Entrada");
    expect(describeNoticeEvent("STATUS", { action: "snoozed", until: "2027-03-05" }, none).title).toBe("Adormecida até 05/03/2027");
    expect(describeNoticeEvent("STATUS", { action: "processed" }, none).tone).toBe("success");
    expect(describeNoticeEvent("STATUS", { action: "discarded", reason: "Repetida" }, { ...none, actor: "Ana" }).detail).toBe("Repetida — Por Ana.");
    expect(describeNoticeEvent("STATUS", { action: "reopened" }, none).title).toBe("Reaberta");
    expect(describeNoticeEvent("STATUS", { action: "created" }, { ...none, actor: "Ana" }).title).toBe("Registrada por Ana");
  });

  it("vínculo com processo: sem título quando o sigilo impede; automático por CNJ explica o motivo", () => {
    expect(describeNoticeEvent("LINKED", { caseId: "c", how: "AUTO_CNJ" }, { ...none, caseTitle: "Maria x Empresa" })).toMatchObject({ title: "Vinculada ao processo Maria x Empresa", detail: "Vinculada automaticamente pelo número CNJ." });
    expect(describeNoticeEvent("LINKED", { caseId: "c" }, none).title).toBe("Vinculada a um processo");
  });

  it("evento desconhecido nunca some: aparece de forma genérica; toda ação declarada tem frase própria e vai/volta do banco sem ambiguidade", () => {
    expect(describeNoticeEvent("FUTURO_X", {}, none).title).toBe("Evento registrado");
    expect(describeNoticeEvent("STATUS", { action: "algo_novo" }, none).title).toBe("Evento registrado");
    for (const a of NOTICE_ACTIONS) {
      const s = storedEvent(a);
      const data = s.action ? { action: s.action } : {};
      expect(actionOfStored(s.kind, data)).toBe(a);
      expect(describeNoticeEvent(s.kind, data, none).title).not.toBe("Evento registrado");
    }
  });

  it("os tipos gravados respeitam a restrição do banco", () => {
    const allowed = ["CAPTURED", "VIEWED", "ASSIGNED", "LINKED", "STATUS", "OFFICIAL_ACK", "DOCUMENT", "NOTE", "EVIDENCE"];
    for (const a of NOTICE_ACTIONS) expect(allowed).toContain(storedEvent(a).kind);
  });
});
