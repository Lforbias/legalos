import { describe, expect, it } from "vitest";
import { mapCase, mapContact, mapDeadline, mapEvent, mapHearing, mapPublication, mapTask, parseDate, parseDateTime } from "@/lib/import/astrea-map";
import { parseCsv } from "@/lib/import/csv";

describe("CSV", () => {
  it("lê aspas, vírgulas, aspas duplicadas, quebras de linha em campo e BOM", () => {
    const rows = parseCsv('﻿"A","B","C"\r\n"1","x, y","linha1\nlinha2"\r\n"2","diz ""oi""",""\n');
    expect(rows).toEqual([
      { A: "1", B: "x, y", C: "linha1\nlinha2" },
      { A: "2", B: 'diz "oi"', C: "" },
    ]);
  });
  it("ignora linhas vazias e tolera falta de colunas", () => {
    expect(parseCsv('"A","B"\n\n"1"\n')).toEqual([{ A: "1", B: "" }]);
    expect(parseCsv("")).toEqual([]);
  });
});

describe("datas do Astrea", () => {
  it("aceita ISO e dd/mm/aaaa com ou sem hora; recusa datas impossíveis", () => {
    expect(parseDateTime("2025-08-19")).toEqual({ ymd: "2025-08-19", hhmm: null });
    expect(parseDateTime("17/11/2022 09:00")).toEqual({ ymd: "2022-11-17", hhmm: "09:00" });
    expect(parseDate("31/02/2024")).toBeNull();
    expect(parseDate("0001-01-01")).toBeNull();
    expect(parseDate("null")).toBeNull();
    expect(parseDate("")).toBeNull();
  });
});

describe("mapeamentos", () => {
  const contact = { Código: "10", Nome: "Maria Teste", "Tipo do contato": "Pessoa Física", CPF: "529.982.247-25", "Endereços de email": "MARIA@Exemplo.com; b@x.com", "Número dos telefones": "(11) 91234-5678", Estados: "SP; SP", CEP: "01001-000", "Dia de nascimento": "3", "Mês de nascimento": "5", "Ano de nascimento": "1974", RG: "12.345", Cidades: "null" };
  it("contato → cliente: documento válido, e-mail em minúsculas, telefone só dígitos, UF e CEP", () => {
    const c = mapContact(contact)!;
    expect(c).toMatchObject({ externalId: "10", type: "PERSON", document: "52998224725", email: "maria@exemplo.com", phone: "11912345678", addressState: "SP", addressZip: "01001000", birthDate: "1974-05-03", addressCity: null });
    expect(c.notes).toContain("RG: 12.345");
  });
  it("CPF inválido não é gravado como documento, mas fica nas observações", () => {
    const c = mapContact({ ...contact, CPF: "111.111.111-11" })!;
    expect(c.document).toBeNull();
    expect(c.notes).toContain("111.111.111-11");
    expect(mapContact({ ...contact, Nome: "" })).toBeNull();
  });

  const proc = { Código: "1", Titulo: "Fulano x Beltrano", Tipo: "Processo", Status: "Inativo", "Número do processo": "5015905-44.2022.4.03.6183", "Data de distribuição": "17/11/2022 09:00", "Data de encerramento": "14/05/2025 15:09", Instância: "2", Clientes: "10; 11", Responsável: "u1" };
  it("processo: CNJ válido, instância, situação encerrada", () => {
    const c = mapCase(proc)!;
    expect(c).toMatchObject({ number: "5015905-44.2022.4.03.6183", legacyNumber: null, status: "CLOSED", phase: "2ª instância", distributedAt: "2022-11-17", clientCodes: ["10", "11"] });
  });
  it("número fora do padrão vira número antigo; atendimento não é processo", () => {
    expect(mapCase({ ...proc, "Número do processo": "444110131" })).toMatchObject({ number: null, legacyNumber: "444110131" });
    expect(mapCase({ ...proc, Tipo: "Atendimento" })).toBeNull();
    expect(mapCase({ ...proc, Status: "Ativo", "Data de encerramento": "" })!.status).toBe("ACTIVE");
    expect(mapCase({ ...proc, Status: "Inativo", "Data de encerramento": "" })!.status).toBe("ARCHIVED");
  });

  it("prazo: 'Em progresso' vira RASCUNHO; feito e cancelado preservados; exige processo e data", () => {
    const base = { Código: "p1", Nome: "Contestar", "Data de vencimento": "2025-08-19", Processo: "1", Status: "Feito" };
    expect(mapDeadline(base)!.status).toBe("FULFILLED");
    expect(mapDeadline({ ...base, Status: "Cancelado" })!.status).toBe("CANCELED");
    expect(mapDeadline({ ...base, Status: "Em progresso" })!.status).toBe("DRAFT");
    expect(mapDeadline({ ...base, Processo: "" })).toBeNull();
    expect(mapDeadline({ ...base, "Data de vencimento": "" })).toBeNull();
  });

  it("tarefa: título curto, prioridade e conclusão", () => {
    const t = mapTask({ Código: "t1", Descrição: "x".repeat(300), Realizada: "Sim", Prioridade: "Alta", "Data fim": "21/10/2024 14:06" })!;
    expect(t.title.length).toBeLessThanOrEqual(200);
    expect(t.description).toBeTruthy();
    expect(t).toMatchObject({ done: true, priority: "HIGH", completedAt: "2024-10-21" });
    expect(mapTask({ Código: "t2", Descrição: "Ligar", Realizada: "Não", Prioridade: "Baixa" })).toMatchObject({ done: false, priority: "LOW" });
  });

  it("audiência e evento: horário e cancelamento", () => {
    const h = mapHearing({ Código: "a1", Nome: "Audiência de instrução", "Data de início": "2025-04-23", "Hora de início": "08:00", "Hora de fim": "09:00", Fórum: "Fórum Central", "Sala do Fórum": "12" })!;
    expect(h).toMatchObject({ kind: "HEARING", startHhmm: "08:00", endHhmm: "09:00", allDay: false });
    expect(h.location).toBe("Fórum Central — Sala 12");
    expect(mapHearing({ Código: "a2", "Data de início": "2025-04-23", Status: "Cancelado" })!.canceled).toBe(true);
    expect(mapEvent({ Código: "e1", "Data de início": "19/04/2024", "Dia inteiro": "Sim", Descrição: "Reunião" })!.allDay).toBe(true);
    expect(mapEvent({ Código: "e2", "Data de início": "19/04/2024", Descrição: "" })).toBeNull();
  });

  it("publicação: status e datas", () => {
    const p = mapPublication({ Código: "n1", Matéria: "Intime-se.", Orgão: "1A VARA CIVEL", Status: "Rejeitada", "Data publicacao": "25/07/2023 09:00", "Data de lançamento": "2023-07-26" })!;
    expect(p).toMatchObject({ status: "DISCARDED", publishedAt: "2023-07-25", receivedAt: "2023-07-26" });
    expect(mapPublication({ Código: "n2", Matéria: "" })).toBeNull();
  });
});

describe("financeiro do Astrea (mapeamento puro)", () => {
  it("lê valores em dinheiro sem ponto flutuante", async () => {
    const { parseAstreaMoney } = await import("@/lib/import/astrea-map");
    expect(parseAstreaMoney("744.3")).toEqual({ negative: false, amount: "744.30" });
    expect(parseAstreaMoney("-1200.00")).toEqual({ negative: true, amount: "1200.00" });
    expect(parseAstreaMoney("300")).toEqual({ negative: false, amount: "300.00" });
    expect(parseAstreaMoney("0.1")).toEqual({ negative: false, amount: "0.10" });
    expect(parseAstreaMoney("1,5")).toBeNull();
    expect(parseAstreaMoney("null")).toBeNull();
    expect(parseAstreaMoney("")).toBeNull();
  });

  it("converte lançamento, parcela 'n-m', pago e aberto; ignora fatura e saldo inicial", async () => {
    const { mapEntry, entrySkipReason } = await import("@/lib/import/astrea-map");
    const base = { Código: "1", Tipo: "Saída", Status: "Feito", Conta: "k", "Sub-Tipo": "Despesa", Descrições: "2-5", Valores: "-10.5", "Valores Originais": "0.0", "Data de vencimento": "2025-03-31", "Data de pagamento": "" };
    const d = mapEntry(base)!;
    expect(d).toMatchObject({ kind: "PAYABLE", type: "EXPENSE", amount: "10.50", paid: true, paidOn: "2025-03-31", installmentNo: 2, installmentTotal: 5, description: "Despesa — parcela 2/5" });
    expect(mapEntry({ ...base, Status: "Aberto" })).toMatchObject({ paid: false, paidOn: null });
    expect(mapEntry({ ...base, Descrições: "5-2" })).toMatchObject({ installmentNo: null, description: "5-2" });
    expect(mapEntry({ ...base, Valores: "0.0" })).toBeNull();
    expect(mapEntry({ ...base, "Data de vencimento": "" })).toBeNull();
    expect(entrySkipReason({ Tipo: "Fatura" })).toMatch(/fatura/);
    expect(entrySkipReason({ Tipo: "Entrada", "Sub-Tipo": "Valor inicial" })).toMatch(/saldo inicial/);
    expect(entrySkipReason({ Tipo: "Entrada", "Sub-Tipo": "Honorário" })).toBeNull();
  });
});
