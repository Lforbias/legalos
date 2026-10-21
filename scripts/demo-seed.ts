/**
 * Escritório de DEMONSTRAÇÃO com dados 100% fictícios, só para gerar as capturas de tela da página /produto.
 * Recusa rodar fora de um banco cujo nome termina em "_demo". Nomes, números e mensagens são inventados.
 *   DATABASE_URL=postgresql://.../legalos_demo npx tsx scripts/demo-seed.ts
 */
import { db } from "../src/lib/db/client";
import { computeCnjCheck } from "../src/lib/validation/br-documents";
import { createAccount, createCategory, createEntry } from "../src/server/services/finance.service";
import { createClient } from "../src/server/services/client.service";
import { createCase } from "../src/server/services/case.service";
import { createDeadline } from "../src/server/services/deadline.service";
import { createEvent } from "../src/server/services/agenda.service";
import { createNotice } from "../src/server/services/notice.service";
import { createTask } from "../src/server/services/task.service";
import { createOrganization } from "../src/server/services/organization.service";
import { ingestMessage, type IngestAccount } from "../src/server/services/whatsapp-ingest.service";
import { registerUser } from "../src/server/services/auth.service";
import { resolveTenantContext } from "../src/server/services/tenant.service";
import type { TenantContext } from "../src/server/context";

const url = process.env.DATABASE_URL ?? "";
if (!/_demo(\?.*)?$/.test(url)) {
  console.error("Recusado: DATABASE_URL precisa apontar para um banco terminado em _demo.");
  process.exit(1);
}
const META = { ipAddress: "127.0.0.1", userAgent: "demo-seed", correlationId: "demo" };
export const DEMO_EMAIL = "demo@escritoriomodelo.test";
export const DEMO_PASSWORD = "DemoSenha2026!";

const ymd = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
const cnj = (seq: number, year: number, seg: string, court: string, origin: string) => {
  const sequence = String(seq).padStart(7, "0");
  const check = computeCnjCheck({ sequence, year: String(year), segment: seg, court, origin });
  return `${sequence}-${check}.${year}.${seg}.${court}.${origin}`;
};
const blankClient = { type: "PERSON" as const, status: "ACTIVE" as const, tradeName: "", document: "", email: "", phone: "", birthDate: "", tags: "", notes: "", addressZip: "", addressStreet: "", addressNumber: "", addressComplement: "", addressDistrict: "", addressCity: "", addressState: "" };

async function member(orgId: string, roleKey: string, name: string, email: string) {
  const user = await registerUser({ name, email, password: DEMO_PASSWORD }, META);
  const role = await db.role.findFirstOrThrow({ where: { organizationId: orgId, key: roleKey } });
  await db.membership.create({ data: { organizationId: orgId, userId: user.id, roleId: role.id } });
  return user;
}

(async () => {
  const owner = await registerUser({ name: "Dra. Helena Albuquerque", email: DEMO_EMAIL, password: DEMO_PASSWORD }, META);
  const org = await createOrganization(owner.id, { name: "Escritório Modelo Advocacia", timezone: "America/Sao_Paulo" }, META);
  const ctx = (await resolveTenantContext(owner.id, org.id, META)) as TenantContext;
  const bruno = await member(org.id, "LAWYER", "Dr. Bruno Tavares", "bruno@escritoriomodelo.test");
  const camila = await member(org.id, "ASSISTANT", "Camila Reis", "camila@escritoriomodelo.test");

  const people = [
    ["Marcos Vinícius Paiva", "PERSON"], ["Fernanda Lacerda Ribeiro", "PERSON"], ["Construtora Horizonte Ltda.", "COMPANY"], ["Roberto Siqueira Neto", "PERSON"],
    ["Patrícia Mendonça Alves", "PERSON"], ["Mercado Bom Preço Eireli", "COMPANY"], ["Luciana Prado Cardoso", "PERSON"], ["Antônio Carlos Furtado", "PERSON"],
  ] as const;
  const clients: { id: string; name: string }[] = [];
  for (const [name, type] of people) {
    const c = await createClient(ctx, { ...blankClient, name, type, phone: "(11) 90000-0000" });
    clients.push({ id: c.id, name });
  }

  const caseDefs = [
    ["Reclamação trabalhista — horas extras e reflexos", "Trabalhista", "TRT-2 · 3ª Vara do Trabalho de São Paulo", "SP", "ACTIVE", "Instrução", cnj(1000412, 2026, "5", "02", "0003"), "48.500,00"],
    ["Revisão de benefício previdenciário (aposentadoria)", "Previdenciário", "Justiça Federal · 4ª Vara Previdenciária", "SP", "ACTIVE", "Conhecimento", cnj(5003187, 2025, "4", "03", "6183"), "127.300,00"],
    ["Ação de cobrança — contrato de empreitada", "Cível", "TJSP · 2ª Vara Cível de Campinas", "SP", "ACTIVE", "Contestação", cnj(1008839, 2026, "8", "26", "0114"), "212.000,00"],
    ["Distrato e devolução de valores — imóvel na planta", "Consumidor", "TJSP · 5ª Vara Cível de Santos", "SP", "ACTIVE", "Sentença", cnj(1015522, 2025, "8", "26", "0562"), "86.900,00"],
    ["Execução fiscal — IPTU 2021/2022", "Tributário", "TJSP · Vara das Execuções Fiscais de Osasco", "SP", "ACTIVE", "Embargos", cnj(1503317, 2026, "8", "26", "0405"), "18.420,00"],
    ["Indenização por atraso na entrega de obra", "Consumidor", "TJSP · 1ª Vara Cível de Guarulhos", "SP", "ACTIVE", "Recurso", cnj(1020045, 2025, "8", "26", "0224"), "64.000,00"],
    ["Rescisão indireta e verbas rescisórias", "Trabalhista", "TRT-2 · 12ª Vara do Trabalho de São Paulo", "SP", "ACTIVE", "Conhecimento", cnj(1000897, 2026, "5", "02", "0012"), "73.800,00"],
    ["Despejo por falta de pagamento", "Cível", "TJSP · 3ª Vara Cível de São Bernardo", "SP", "CLOSED", "Encerrado", cnj(1011730, 2024, "8", "26", "0510"), "31.200,00"],
  ] as const;
  const cases: { id: string; title: string }[] = [];
  for (const [i, d] of caseDefs.entries()) {
    const c = await createCase(ctx, {
      number: d[6], legacyNumber: "", title: d[0], area: d[1], court: d[2].split(" · ")[0]!, courtUnit: d[2].split(" · ")[1] ?? "", courtState: d[3], subject: "", claimValue: d[7],
      status: d[4], phase: d[5], distributedAt: ymd(-90 - i * 20), confidential: false, notes: "", responsibleId: i % 2 ? bruno.id : owner.id,
      clientId: clients[i % clients.length]!.id, clientRole: i % 3 === 2 ? "DEFENDANT" : "PLAINTIFF",
    });
    cases.push({ id: c.id, title: d[0] });
  }

  const taskDefs = [
    ["Preparar réplica à contestação", "URGENT", "IN_PROGRESS", 1, bruno.id], ["Reunir holerites e cartões de ponto", "HIGH", "TODO", 2, camila.id],
    ["Protocolar recurso de apelação", "HIGH", "TODO", 3, owner.id], ["Ligar para o cliente sobre o acordo", "NORMAL", "TODO", 0, camila.id],
    ["Conferir cálculo de liquidação", "NORMAL", "WAITING", 5, bruno.id], ["Enviar procuração para assinatura", "LOW", "DONE", -2, camila.id],
    ["Juntar comprovantes de pagamento", "HIGH", "IN_PROGRESS", 1, camila.id], ["Revisar minuta de embargos", "URGENT", "TODO", 0, owner.id],
  ] as const;
  for (const [i, t] of taskDefs.entries()) {
    await createTask(ctx, { title: t[0], description: "", status: t[2], priority: t[1], dueDate: ymd(t[3]), assigneeId: t[4], caseId: cases[i % cases.length]!.id, clientId: "" });
  }

  const dl = [["Réplica à contestação", "Réplica", 3, 0], ["Recurso de apelação", "Recurso", 8, 1], ["Embargos à execução", "Embargos", 5, 4], ["Manifestação sobre laudo", "Manifestação", 12, 2], ["Contrarrazões", "Contrarrazões", 15, 5]] as const;
  for (const [i, d] of dl.entries()) {
    await createDeadline(ctx, { caseId: cases[d[3]]!.id, title: d[0], kind: d[1], startDate: "", days: "", countType: "", dueDate: ymd(d[2]), internalDueDate: ymd(d[2] - 2), responsibleId: i % 2 ? bruno.id : owner.id, notes: "", calculationNote: "" });
  }

  const ev = [["Audiência de instrução", "HEARING", 4, "14:00", 0], ["Reunião com cliente — estratégia", "MEETING", 1, "10:00", 1], ["Diligência no cartório", "DILIGENCE", 2, "15:30", 4], ["Audiência de conciliação", "HEARING", 9, "09:30", 2]] as const;
  for (const e of ev) {
    await createEvent(ctx, { title: e[0], kind: e[1], date: ymd(e[2]), allDay: false, startTime: e[3], endTime: "", location: "", description: "", caseId: cases[e[4]]!.id, clientId: "" });
  }

  const notices = [
    ["INTIMACAO", "Intimação para réplica", "Fica a parte autora intimada, na pessoa de seu advogado, para manifestar-se em réplica à contestação, no prazo de 15 (quinze) dias úteis.", 0],
    ["SENTENCA", "Sentença publicada", "Vistos. Julgo parcialmente procedente o pedido, nos termos da fundamentação. Custas e honorários na forma da lei. Publique-se. Intimem-se.", 3],
    ["DESPACHO", "Despacho — designação de audiência", "Designo audiência de instrução e julgamento. Intimem-se as partes e as testemunhas arroladas.", 1],
    ["DECISAO", "Decisão — tutela de urgência", "Presentes os requisitos legais, defiro a tutela de urgência pleiteada. Cite-se e intime-se.", 4],
    ["INTIMACAO", "Intimação para manifestação sobre laudo", "Intimem-se as partes para manifestação sobre o laudo pericial juntado aos autos, no prazo comum de 10 (dez) dias.", 2],
  ] as const;
  for (const n of notices) {
    await createNotice(ctx, { source: "MANUAL", kind: n[0], title: n[1], content: n[2], caseNumber: caseDefs[n[3]]![6], court: caseDefs[n[3]]![2].split(" · ")[0]!, publishedAt: ymd(-1), receivedAt: ymd(0), caseId: "" });
  }

  const acc = await createAccount(ctx, { name: "Conta corrente — Banco Exemplo", kind: "CHECKING", initialBalance: "18.500,00", openingDate: ymd(-120) });
  const cat = await createCategory(ctx, { name: "Honorários", color: "#3565f0" });
  const catExp = await createCategory(ctx, { name: "Custas e despesas", color: "#8b6cff" });
  for (const [i, c] of clients.slice(0, 6).entries()) {
    await createEntry(ctx, { kind: "RECEIVABLE", type: "FEE", description: `Honorários — ${c.name}`, amount: `${(2400 + i * 650).toLocaleString("pt-BR")},00`, issueDate: ymd(-20), dueDate: ymd(-10 + i * 6), accountId: acc.id, categoryId: cat.id, costCenterId: "", clientId: c.id, caseId: cases[i]!.id, counterparty: "", notes: "", installments: i % 2 ? "3" : "1" });
  }
  await createEntry(ctx, { kind: "PAYABLE", type: "EXPENSE", description: "Custas judiciais — preparo de recurso", amount: "1.240,00", issueDate: ymd(-3), dueDate: ymd(2), accountId: acc.id, categoryId: catExp.id, costCenterId: "", clientId: "", caseId: cases[5]!.id, counterparty: "", notes: "", installments: "1" });

  const wa = await db.whatsappAccount.create({ data: { organizationId: org.id, label: "Atendimento", provider: "META", displayPhone: "(11) 4000-0000", phoneNumberId: "demo-phone-id", tokenEnc: "demo-sem-token-real", enabled: true, createdById: owner.id } });
  const ia: IngestAccount = { id: wa.id, organizationId: org.id, awayEnabled: false, awayMessage: null, openFrom: "00:00", openUntil: "23:59", openDays: [0, 1, 2, 3, 4, 5, 6] };
  const chats: [string, string, [boolean, string][]][] = [
    ["5511900000001", "Marcos Paiva", [[false, "Bom dia, doutora! Tem novidade sobre a audiência?"], [true, "Bom dia, Marcos! Sim: ficou marcada para a próxima quinta, às 14h. Vou te mandar a orientação por aqui."], [false, "Perfeito, obrigado! Preciso levar algum documento?"], [true, "Só um documento com foto. Já está tudo no processo."]]],
    ["5511900000002", "Fernanda Lacerda", [[false, "Oi! Enviei os holerites que vocês pediram."], [true, "Recebi, Fernanda. Obrigada! Vamos conferir e juntar ainda hoje."]]],
    ["5511900000003", "Construtora Horizonte", [[false, "Boa tarde. Podemos antecipar a reunião de quarta?"]]],
    ["5511900000004", "Roberto Siqueira", [[false, "Doutora, o oficial de justiça esteve aqui hoje cedo."], [true, "Obrigada por avisar, Roberto. Já vamos verificar no processo."]]],
  ];
  const t0 = Date.now() - 6 * 3_600_000;
  let n = 0;
  for (const [waId, name, msgs] of chats) {
    for (const [fromMe, text] of msgs) {
      await ingestMessage(ia, { waMessageId: `demo-${waId}-${n++}`, waId, contactName: name, type: "text", text, timestamp: new Date(t0 + n * 7 * 60_000), fromMe, media: null });
    }
  }
  const first = await db.whatsappConversation.findFirst({ where: { organizationId: org.id, waId: "5511900000001" } });
  if (first) await db.whatsappConversation.update({ where: { id: first.id }, data: { assignedToId: owner.id, clientId: clients[0]!.id, caseId: cases[0]!.id, assignedAt: new Date() } });
  await db.user.updateMany({ data: { emailVerifiedAt: new Date() } });
  console.log(`Demo pronta. Login: ${DEMO_EMAIL} / ${DEMO_PASSWORD} — escritório ${org.id}`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
