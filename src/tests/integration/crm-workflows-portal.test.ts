import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/logging/logger";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { createCase } from "@/server/services/case.service";
import { acceptProposal, addLeadActivity, changeLeadStage, convertLead, createLead, createProposal, deleteLead, getLead, listLeads, markLeadLost, reopenLead, sendProposal, updateProposal } from "@/server/services/crm.service";
import { uploadDocument } from "@/server/services/document.service";
import { acceptInvitation, createInvitation } from "@/server/services/invitation.service";
import { getPortalCase, getPortalDocumentForDownload, hasPortalAccess, inviteClientToPortal, listPortalCases, listPortalDocuments, revokePortalAccess, setCaseSharing, setDocumentSharing } from "@/server/services/portal.service";
import { resolveTenantContext } from "@/server/services/tenant.service";
import { createClient } from "@/server/services/client.service";
import { createRule, deleteRule, getRule, listRecentRuns, listRules, runWorkflows, setRuleActive } from "@/server/services/workflow.service";
import type { ClientInput } from "@/modules/clients/schemas";
import type { TenantContext } from "@/server/context";
import { META, addMember, makeOrgWithOwner, makeUser, roleByKey } from "./helpers";

const pdf = (tag: string) => Buffer.from(`%PDF-1.4\n% ${tag}\n%%EOF`);
const lead = (name: string, extra: Record<string, string> = {}) => ({ name, type: "PERSON" as const, email: "", phone: "", source: "", interest: "", estimatedValue: "", ownerId: "", nextActionDate: "", notes: "", ...extra });
const caseBase = { number: "", legacyNumber: "", title: "Caso", area: "", court: "TJSP", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };
const rule = (extra: Record<string, unknown> = {}) => ({ name: "Regra teste", trigger: "CASE_CREATED", taskTitle: "Revisar {{gatilho}}", taskDescription: "", dueDays: "3", priority: "NORMAL", assigneeMode: "TRIGGER_USER", assigneeId: "", active: true, ...extra });
const clientInput = (name: string): ClientInput => ({
  type: "PERSON", status: "ACTIVE", name, tradeName: "", document: "", email: "", phone: "", birthDate: "", tags: "",
  notes: "", addressZip: "", addressStreet: "", addressNumber: "", addressComplement: "", addressDistrict: "", addressCity: "", addressState: "",
});

describe("CRM, automações e portal (Fase 6)", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let assistant: Awaited<ReturnType<typeof addMember>>;
  let controller: Awaited<ReturnType<typeof addMember>>;
  let finance: Awaited<ReturnType<typeof addMember>>;

  beforeAll(async () => {
    A = await makeOrgWithOwner("f6-A");
    B = await makeOrgWithOwner("f6-B");
    lawyer = await addMember(A.org.id, "LAWYER", "f6-l");
    assistant = await addMember(A.org.id, "ASSISTANT", "f6-as");
    controller = await addMember(A.org.id, "CONTROLLER", "f6-c");
    finance = await addMember(A.org.id, "FINANCE", "f6-f");
  });

  describe("CRM", () => {
    it("ciclo do lead: etapas manuais, perdido com motivo, reabrir", async () => {
      const l = await createLead(lawyer.ctx, lead("Maria Lead"));
      expect(l.stage).toBe("NEW");
      await changeLeadStage(lawyer.ctx, l.id, "MEETING");
      await expect(changeLeadStage(lawyer.ctx, l.id, "WON")).rejects.toBeInstanceOf(ValidationError);
      await expect(changeLeadStage(lawyer.ctx, l.id, "LOST")).rejects.toBeInstanceOf(ValidationError);
      await expect(markLeadLost(lawyer.ctx, l.id, "  ")).rejects.toBeInstanceOf(ValidationError);
      await markLeadLost(lawyer.ctx, l.id, "Escolheu outro escritório");
      await expect(changeLeadStage(lawyer.ctx, l.id, "NEW")).rejects.toBeInstanceOf(ConflictError);
      await expect(markLeadLost(lawyer.ctx, l.id, "de novo")).rejects.toBeInstanceOf(ConflictError);
      await reopenLead(lawyer.ctx, l.id);
      await expect(reopenLead(lawyer.ctx, l.id)).rejects.toBeInstanceOf(ConflictError);
      const { lead: after } = await getLead(lawyer.ctx, l.id);
      expect(after.stage).toBe("NEW");
      expect(after.lostReason).toBeNull();
      expect(after.activities.length).toBeGreaterThanOrEqual(4);
      await addLeadActivity(lawyer.ctx, l.id, { kind: "CALL", body: "Liguei e combinamos reunião" });
    });

    it("valida entradas e valor estimado", async () => {
      await expect(createLead(lawyer.ctx, lead("X"))).rejects.toThrow();
      await expect(createLead(lawyer.ctx, lead("Fulano", { email: "invalido" }))).rejects.toThrow();
      const l = await createLead(lawyer.ctx, lead("Com valor", { estimatedValue: "1.500,50" }));
      expect(l.estimatedValue?.toString()).toBe("1500.5");
    });

    it("converte em cliente numa transação: cliente criado, lead GANHO e vinculado", async () => {
      const l = await createLead(lawyer.ctx, lead("Conversão", { email: "conv@example.test" }));
      const { clientId } = await convertLead(lawyer.ctx, l.id, "");
      const client = await db.client.findFirstOrThrow({ where: { id: clientId } });
      expect(client.organizationId).toBe(A.org.id);
      expect(client.name).toBe("Conversão");
      const { lead: won } = await getLead(lawyer.ctx, l.id);
      expect(won.stage).toBe("WON");
      expect(won.clientId).toBe(clientId);
      await expect(convertLead(lawyer.ctx, l.id, "")).rejects.toBeInstanceOf(ConflictError);
      await expect(deleteLead(lawyer.ctx, l.id)).rejects.toBeInstanceOf(ConflictError);
      await expect(markLeadLost(lawyer.ctx, l.id, "tarde demais")).rejects.toBeInstanceOf(ConflictError);
    });

    it("conversão concorrente: só um cliente é criado", async () => {
      const l = await createLead(lawyer.ctx, lead("Concorrente"));
      const before = await db.client.count({ where: { organizationId: A.org.id } });
      const r = await Promise.allSettled([convertLead(lawyer.ctx, l.id, ""), convertLead(lawyer.ctx, l.id, "")]);
      expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(await db.client.count({ where: { organizationId: A.org.id } })).toBe(before + 1);
    });

    it("documento inválido ou duplicado na conversão não cria nada", async () => {
      const l = await createLead(lawyer.ctx, lead("Doc ruim"));
      await expect(convertLead(lawyer.ctx, l.id, "111.111.111-11")).rejects.toBeInstanceOf(ValidationError);
      expect((await getLead(lawyer.ctx, l.id)).lead.stage).toBe("NEW");
      await createClient(lawyer.ctx, { ...clientInput("Já existe"), document: "529.982.247-25" });
      await expect(convertLead(lawyer.ctx, l.id, "52998224725")).rejects.toBeInstanceOf(ConflictError);
      expect((await getLead(lawyer.ctx, l.id)).lead.clientId).toBeNull();
    });

    it("propostas: rascunho → enviada (move lead p/ Proposta) → aceita; edição só em rascunho", async () => {
      const l = await createLead(lawyer.ctx, lead("Com proposta"));
      const p = await createProposal(lawyer.ctx, l.id, { title: "Honorários", amount: "5.000,00", description: "", validUntil: "" });
      expect(p.amount.toString()).toBe("5000");
      await updateProposal(lawyer.ctx, p.id, { title: "Honorários v2", amount: "6.000,00", description: "", validUntil: "" });
      await expect(acceptProposal(lawyer.ctx, p.id)).rejects.toBeInstanceOf(ConflictError);
      await sendProposal(lawyer.ctx, p.id);
      await expect(sendProposal(lawyer.ctx, p.id)).rejects.toBeInstanceOf(ConflictError);
      await expect(updateProposal(lawyer.ctx, p.id, { title: "Alterada", amount: "1,00", description: "", validUntil: "" })).rejects.toBeInstanceOf(ConflictError);
      expect((await getLead(lawyer.ctx, l.id)).lead.stage).toBe("PROPOSAL");
      await acceptProposal(lawyer.ctx, p.id);
      await expect(createProposal(lawyer.ctx, l.id, { title: "Outra", amount: "1,00", description: "", validUntil: "" })).resolves.toBeTruthy();
    });

    it("permissões: assistente/financeiro não acessam o CRM; converter exige clients:write", async () => {
      await expect(listLeads(finance.ctx)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(createLead(finance.ctx, lead("Nope"))).rejects.toBeInstanceOf(ForbiddenError);
      const l = await createLead(lawyer.ctx, lead("Permissões"));
      if (assistant.ctx.permissions.has("crm:write") && !assistant.ctx.permissions.has("clients:write")) {
        await expect(convertLead(assistant.ctx, l.id, "")).rejects.toBeInstanceOf(ForbiddenError);
      }
      expect((await getLead(lawyer.ctx, l.id)).lead.stage).toBe("NEW");
    });

    it("isolamento entre escritórios", async () => {
      const l = await createLead(lawyer.ctx, lead("Só da A"));
      const p = await createProposal(lawyer.ctx, l.id, { title: "Proposta A", amount: "10,00", description: "", validUntil: "" });
      await expect(getLead(B.ctx, l.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(changeLeadStage(B.ctx, l.id, "CONTACTED")).rejects.toBeInstanceOf(NotFoundError);
      await expect(convertLead(B.ctx, l.id, "")).rejects.toBeInstanceOf(NotFoundError);
      await expect(markLeadLost(B.ctx, l.id, "motivo qualquer")).rejects.toBeInstanceOf(ConflictError);
      await expect(sendProposal(B.ctx, p.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(createProposal(B.ctx, l.id, { title: "Invasora", amount: "1,00", description: "", validUntil: "" })).rejects.toBeInstanceOf(NotFoundError);
      expect((await listLeads(B.ctx)).items.some((i) => i.id === l.id)).toBe(false);
      expect((await getLead(lawyer.ctx, l.id)).lead.stage).toBe("NEW");
    });
  });

  describe("automações", () => {
    it("só quem tem workflows:manage gerencia regras", async () => {
      await expect(createRule(lawyer.ctx, rule())).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listRules(assistant.ctx)).rejects.toBeInstanceOf(ForbiddenError);
      const r = await createRule(controller.ctx, rule({ name: "Permitida" }));
      expect((await listRules(controller.ctx)).some((x) => x.id === r.id)).toBe(true);
    });

    it("processo criado dispara a regra uma única vez e é idempotente", async () => {
      const r = await createRule(A.ctx, rule({ name: "Novo processo", taskTitle: "Conferir {{gatilho}}", dueDays: "5" }));
      const c = await createCase(lawyer.ctx, { ...caseBase, title: "Processo automático" });
      const tasks = await db.task.findMany({ where: { organizationId: A.org.id, caseId: c.id, title: { startsWith: "Conferir" } } });
      expect(tasks).toHaveLength(1);
      expect(tasks[0]?.title).toBe("Conferir Processo automático");
      expect(tasks[0]?.assigneeId).toBe(lawyer.user.id);
      const again = await runWorkflows(lawyer.ctx, "CASE_CREATED", { type: "case", id: c.id, userId: lawyer.user.id, label: c.title, baseDate: "2026-10-20", caseId: c.id });
      expect(again).toBe(0);
      expect(await db.task.count({ where: { organizationId: A.org.id, caseId: c.id, title: { startsWith: "Conferir" } } })).toBe(1);
      expect((await listRecentRuns(A.ctx)).some((x) => x.ruleId === r.id && x.status === "CREATED")).toBe(true);
    });

    it("regra desativada ou excluída não dispara; regra de outro escritório nunca dispara", async () => {
      const off = await createRule(A.ctx, rule({ name: "Desligada", taskTitle: "NAO-DEVE-EXISTIR" }));
      await setRuleActive(A.ctx, off.id, false);
      const del = await createRule(A.ctx, rule({ name: "Apagada", taskTitle: "NAO-DEVE-EXISTIR-2" }));
      await deleteRule(A.ctx, del.id);
      await createRule(B.ctx, rule({ name: "Da B", taskTitle: "SO-DA-B" }));
      const c = await createCase(lawyer.ctx, { ...caseBase, title: "Sem regra" });
      expect(await db.task.count({ where: { caseId: c.id, title: { startsWith: "NAO-DEVE" } } })).toBe(0);
      expect(await db.task.count({ where: { title: "SO-DA-B", organizationId: A.org.id } })).toBe(0);
      await expect(getRule(B.ctx, off.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(setRuleActive(B.ctx, off.id, true)).rejects.toBeInstanceOf(NotFoundError);
      await expect(deleteRule(B.ctx, off.id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("lead ganho dispara regra LEAD_WON; responsável inválido na regra é recusado", async () => {
      await createRule(A.ctx, rule({ name: "Boas-vindas", trigger: "LEAD_WON", taskTitle: "Onboarding de {{gatilho}}" }));
      const l = await createLead(lawyer.ctx, lead("Cliente Novo"));
      const { clientId } = await convertLead(lawyer.ctx, l.id, "");
      const t = await db.task.findFirst({ where: { organizationId: A.org.id, clientId, title: "Onboarding de Cliente Novo" } });
      expect(t).not.toBeNull();
      await expect(createRule(A.ctx, rule({ assigneeMode: "FIXED", assigneeId: B.owner.id }))).rejects.toBeInstanceOf(ValidationError);
      await expect(createRule(A.ctx, rule({ trigger: "LEAD_WON", assigneeMode: "CASE_RESPONSIBLE" }))).rejects.toThrow();
    });

    it("processo sigiloso: responsável sem acesso não recebe a tarefa", async () => {
      await createRule(A.ctx, rule({ name: "Fixa assistente", taskTitle: "Sigilo {{gatilho}}", assigneeMode: "FIXED", assigneeId: assistant.user.id }));
      const c = await createCase(lawyer.ctx, { ...caseBase, title: "Segredo", confidential: true });
      const t = await db.task.findFirstOrThrow({ where: { caseId: c.id, title: "Sigilo Segredo" } });
      expect(t.assigneeId).toBeNull();
    });

    it("falha ao executar regra não desfaz a ação original", async () => {
      const spy = vi.spyOn(db.workflowRule, "findMany").mockRejectedValueOnce(new Error("banco indisponível"));
      const c = await createCase(lawyer.ctx, { ...caseBase, title: "Sobrevive" });
      spy.mockRestore();
      expect(await db.case.count({ where: { id: c.id } })).toBe(1);
    });
  });

  describe("portal do cliente", () => {
    let client1: { id: string };
    let client2: { id: string };
    let clientUser: Awaited<ReturnType<typeof makeUser>>;
    let cctx: TenantContext;
    let shared: { id: string };
    let unshared: { id: string };
    let other: { id: string };
    let secret: { id: string };
    let docShared: { id: string };
    let docPrivate: { id: string };
    let docOther: { id: string };
    let token = "";

    beforeAll(async () => {
      client1 = await createClient(lawyer.ctx, clientInput("Cliente Um"));
      client2 = await createClient(lawyer.ctx, clientInput("Cliente Dois"));
      shared = await createCase(lawyer.ctx, { ...caseBase, title: "Compartilhado", clientId: client1.id });
      unshared = await createCase(lawyer.ctx, { ...caseBase, title: "Interno", clientId: client1.id });
      other = await createCase(lawyer.ctx, { ...caseBase, title: "Do outro", clientId: client2.id });
      secret = await createCase(lawyer.ctx, { ...caseBase, title: "Sigiloso do um", clientId: client1.id, confidential: true });
      docShared = await uploadDocument(lawyer.ctx, { caseId: shared.id }, { name: "visivel.pdf", buffer: pdf("v") });
      docPrivate = await uploadDocument(lawyer.ctx, { caseId: shared.id }, { name: "interno.pdf", buffer: pdf("i") });
      docOther = await uploadDocument(lawyer.ctx, { caseId: other.id }, { name: "outro.pdf", buffer: pdf("o") });
      for (const c of [shared, other, secret]) await setCaseSharing(lawyer.ctx, c.id, true);
      await setDocumentSharing(lawyer.ctx, docShared.id, true);
      await setDocumentSharing(lawyer.ctx, docOther.id, true);

      clientUser = await makeUser("f6-cliente");
      const spy = vi.spyOn(logger, "info");
      await inviteClientToPortal(A.ctx, client1.id, clientUser.email);
      const call = spy.mock.calls.find((c) => String(JSON.stringify(c)).includes("accept-invite"));
      spy.mockRestore();
      token = /token=([A-Za-z0-9_-]+)/.exec(JSON.stringify(call))?.[1] ?? "";
      expect(token).not.toBe("");
      await acceptInvitation(clientUser.id, token, META);
      cctx = (await resolveTenantContext(clientUser.id, A.org.id, META)) as TenantContext;
    });

    afterAll(() => vi.restoreAllMocks());

    it("aceitar o convite cria a conta do portal amarrada ao cliente e o convite não é reutilizável", async () => {
      expect(cctx.roleKey).toBe("CLIENT");
      expect(await db.portalAccount.count({ where: { organizationId: A.org.id, userId: clientUser.id, clientId: client1.id, revokedAt: null } })).toBe(1);
      await expect(acceptInvitation(clientUser.id, token, META)).rejects.toBeInstanceOf(ValidationError);
      expect(await hasPortalAccess(cctx)).toBe(true);
    });

    it("cliente vê só processos compartilhados do próprio cliente (nem de outros clientes)", async () => {
      const cases = await listPortalCases(cctx);
      expect(cases.map((c) => c.id)).toContain(shared.id);
      expect(cases.map((c) => c.id)).not.toContain(unshared.id);
      expect(cases.map((c) => c.id)).not.toContain(other.id);
      await expect(getPortalCase(cctx, unshared.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(getPortalCase(cctx, other.id)).rejects.toBeInstanceOf(NotFoundError);
      const view = await getPortalCase(cctx, shared.id);
      expect(view.documents.map((d) => d.id)).toEqual([docShared.id]);
    });

    it("processo sigiloso só chega ao cliente por compartilhamento explícito de quem tem acesso a ele", async () => {
      await expect(setCaseSharing(assistant.ctx, secret.id, false)).rejects.toThrow(); // sem acesso ao sigiloso (ou sem cases:write)
      await setCaseSharing(lawyer.ctx, secret.id, false);
      expect((await listPortalCases(cctx)).map((c) => c.id)).not.toContain(secret.id);
      await expect(getPortalCase(cctx, secret.id)).rejects.toBeInstanceOf(NotFoundError);
      await setCaseSharing(lawyer.ctx, secret.id, true);
      expect((await listPortalCases(cctx)).map((c) => c.id)).toContain(secret.id);
    });

    it("documentos: só os compartilhados do próprio cliente; download barrado nos demais", async () => {
      const docs = await listPortalDocuments(cctx);
      expect(docs.map((d) => d.id)).toEqual([docShared.id]);
      await expect(getPortalDocumentForDownload(cctx, docShared.id)).resolves.toBeTruthy();
      await expect(getPortalDocumentForDownload(cctx, docPrivate.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(getPortalDocumentForDownload(cctx, docOther.id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("descompartilhar remove o acesso imediatamente", async () => {
      await setDocumentSharing(lawyer.ctx, docShared.id, false);
      await expect(getPortalDocumentForDownload(cctx, docShared.id)).rejects.toBeInstanceOf(NotFoundError);
      await setDocumentSharing(lawyer.ctx, docShared.id, true);
      await setCaseSharing(lawyer.ctx, shared.id, false);
      await expect(getPortalCase(cctx, shared.id)).rejects.toBeInstanceOf(NotFoundError);
      await setCaseSharing(lawyer.ctx, shared.id, true);
    });

    it("cliente não usa serviços da equipe", async () => {
      await expect(listLeads(cctx)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(createLead(cctx, lead("Invasor"))).rejects.toBeInstanceOf(ForbiddenError);
      await expect(createRule(cctx, rule())).rejects.toBeInstanceOf(ForbiddenError);
      await expect(setCaseSharing(cctx, shared.id, false)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(setDocumentSharing(cctx, docShared.id, false)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(inviteClientToPortal(cctx, client1.id, "x@example.test")).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("equipe sem permissão não gerencia o portal; funcionário da equipe não pode ser convidado como cliente", async () => {
      await expect(inviteClientToPortal(finance.ctx, client1.id, "z@example.test")).rejects.toBeInstanceOf(ForbiddenError);
      await expect(inviteClientToPortal(lawyer.ctx, client1.id, "z@example.test")).rejects.toBeInstanceOf(ForbiddenError);
      await expect(inviteClientToPortal(A.ctx, client1.id, assistant.user.email)).rejects.toBeInstanceOf(ConflictError);
      const clientRole = await roleByKey(A.org.id, "CLIENT");
      await expect(createInvitation(A.ctx, { email: "novo@example.test", roleId: clientRole.id })).rejects.toBeInstanceOf(ValidationError);
    });

    it("isolamento entre escritórios no lado da equipe", async () => {
      await expect(inviteClientToPortal(B.ctx, client1.id, "q@example.test")).rejects.toBeInstanceOf(NotFoundError);
      await expect(setCaseSharing(B.ctx, shared.id, false)).rejects.toBeInstanceOf(NotFoundError);
      await expect(setDocumentSharing(B.ctx, docShared.id, false)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("acesso revogado deixa o cliente sem nada", async () => {
      const acc = await db.portalAccount.findFirstOrThrow({ where: { organizationId: A.org.id, userId: clientUser.id, revokedAt: null } });
      await expect(revokePortalAccess(B.ctx, acc.id)).rejects.toBeInstanceOf(NotFoundError);
      await revokePortalAccess(lawyer.ctx, acc.id);
      expect(await hasPortalAccess(cctx)).toBe(false);
      expect(await listPortalCases(cctx)).toEqual([]);
      expect(await listPortalDocuments(cctx)).toEqual([]);
      await expect(getPortalDocumentForDownload(cctx, docShared.id)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
