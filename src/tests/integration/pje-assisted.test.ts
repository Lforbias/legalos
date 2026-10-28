import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { base32Encode, totpCode, totpStep, verifyTotp } from "@/lib/security/totp";
import { computeCnjCheck } from "@/lib/validation/br-documents";
import { createCaseSchema } from "@/modules/cases/schemas";
import { EMPTY_TASK } from "@/modules/tasks/schemas";
import { ForbiddenError, NotFoundError } from "@/lib/permissions/check";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { saveCourtOtp, listCourtOtps, revealCourtOtp, revokeCourtOtp } from "@/server/services/court-otp.service";
import { receivePjeDiscoveries, listPjeDiscoveries, linkPjeDiscovery } from "@/server/services/pje-discovery.service";
import { createPersonalPjeKey, listPersonalPjeKeys, revokePersonalPjeKey } from "@/server/services/apikey.service";
import { createCase, getCase } from "@/server/services/case.service";
import { createTask, getTask } from "@/server/services/task.service";
import { GET, POST } from "@/app/api/v1/pje/discoveries/route";
import { GET as readCases } from "@/app/api/v1/cases/route";
import { META, addMember, makeOrgWithOwner } from "./helpers";
const secret = base32Encode(Buffer.from("12345678901234567890"));
const cnj = (sequence: string) => { const p = { sequence, year: "2026", segment: "8", court: "05", origin: "0001" }; return `${sequence}-${computeCnjCheck(p)}.2026.8.05.0001`; };
const base = createCaseSchema.parse({ number: "", legacyNumber: "INSS-1234", title: "Caso administrativo existente", area: "Previdenciário", court: "", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE", phase: "", distributedAt: "", confidential: false, notes: "Manter histórico", responsibleId: "", clientId: "", clientRole: "PLAINTIFF", nature: "ADMINISTRATIVE" });

describe("PJe: OTP pessoal, captura restrita e vínculo confirmado", () => {
  let a: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let b: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let colleague: Awaited<ReturnType<typeof addMember>>;
  let codes: string[]; let colleagueCodes: string[];
  beforeAll(async () => {
    process.env.CERT_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    a = await makeOrgWithOwner("pje-a"); b = await makeOrgWithOwner("pje-b"); colleague = await addMember(a.org.id, "LAWYER", "pje-colega");
    const enroll = await startEnrollment(a.owner.id, a.owner.email); codes = await confirmEnrollment(a.owner.id, totpCode(enroll.secret, totpStep()), META);
    const other = await startEnrollment(colleague.user.id, colleague.user.email); colleagueCodes = await confirmEnrollment(colleague.user.id, totpCode(other.secret, totpStep()), META);
  });
  it("guarda segredo cifrado, confirma código e gera OTP sem expor chave nem auditoria sensível", async () => {
    const otp = await saveCourtOtp(a.ctx, { label: "PJe pessoal", secret, confirmationCode: totpCode(secret, totpStep()), authorizationCode: codes.shift() });
    expect((await db.courtOtpAuthenticator.findUniqueOrThrow({ where: { id: otp.id } })).secretEnc).not.toContain(secret);
    expect(await listCourtOtps(colleague.ctx)).toEqual([]);
    await expect(revealCourtOtp(colleague.ctx, otp.id, colleagueCodes.shift()!)).rejects.toBeInstanceOf(NotFoundError);
    await expect(revealCourtOtp(b.ctx, otp.id, "000000")).rejects.toBeInstanceOf(NotFoundError);
    const output = await revealCourtOtp(a.ctx, otp.id, codes.shift()!);
    expect(verifyTotp(secret, output.code)).not.toBeNull();
    expect(Date.parse(output.expiresAt)).toBeGreaterThan(Date.now());
    expect(output).not.toHaveProperty("secret");
    expect(JSON.stringify(await db.auditLog.findMany({ where: { resourceId: otp.id } }))).not.toContain(secret);
    await revokeCourtOtp(a.ctx, otp.id, codes.shift()!);
    expect(await listCourtOtps(a.ctx)).toEqual([]);
    expect((await db.courtOtpAuthenticator.findUniqueOrThrow({ where: { id: otp.id } })).secretEnc).toBe("");
  });
  it("recusa OTP sem confirmação e dados fora de perfil", async () => {
    await expect(saveCourtOtp(a.ctx, { label: "PJe errado", secret, confirmationCode: "000000", authorizationCode: codes.shift() })).rejects.toThrow();
    expect(await listCourtOtps(a.ctx)).toEqual([]);
  });
  it("deduplica CNJ, limita a fila à pessoa e recusa origens ou CNJs inválidos", async () => {
    const number = cnj("0000002");
    await receivePjeDiscoveries(a.ctx, { sourceOrigin: "https://pje.tjba.jus.br", numbers: [number, number.replace(/\D/g, "")] });
    await receivePjeDiscoveries(a.ctx, { sourceOrigin: "https://pje.tjba.jus.br", numbers: [number] });
    expect((await listPjeDiscoveries(a.ctx)).filter(d => d.number === number)).toHaveLength(1);
    expect(await listPjeDiscoveries(colleague.ctx)).toEqual([]);
    await expect(receivePjeDiscoveries(a.ctx, { sourceOrigin: "https://pje.tjba.jus.br/pje?secret=x", numbers: [number] })).rejects.toThrow();
    await expect(receivePjeDiscoveries(a.ctx, { sourceOrigin: "https://evil.test", numbers: [number] })).rejects.toThrow();
    await expect(receivePjeDiscoveries(a.ctx, { sourceOrigin: "https://pje.tjba.jus.br", numbers: ["0000002-00.2026.8.05.0001"] })).rejects.toThrow();
  });
  it("judicializa um caso confirmado preservando dados e tarefa e trata repetição sem duplicar", async () => {
    const c = await createCase(a.ctx, base);
    const t = await createTask(a.ctx, { ...EMPTY_TASK, title: "Cobrar documentos", caseId: c.id });
    const discovery = (await listPjeDiscoveries(a.ctx))[0]!;
    await expect(linkPjeDiscovery(colleague.ctx, { id: discovery.id, caseId: c.id })).rejects.toBeInstanceOf(NotFoundError);
    const result = await linkPjeDiscovery(a.ctx, { id: discovery.id, caseId: c.id });
    expect(result.caseId).toBe(c.id);
    expect((await getCase(a.ctx, c.id))).toMatchObject({ nature: "JUDICIAL", legacyNumber: "INSS-1234", notes: "Manter histórico", number: discovery.number });
    expect((await getTask(a.ctx, t.id)).caseId).toBe(c.id);
    expect(await linkPjeDiscovery(a.ctx, { id: discovery.id, caseId: c.id })).toEqual(result);
  });
  it("cria um processo sigiloso para o cliente confirmado e confirma simultaneamente sem duplicar", async () => {
    const client = await db.client.create({ data: { organizationId: a.org.id, name: "Cliente escolhido", type: "PERSON", status: "ACTIVE" } });
    const number = cnj("0000005");
    await receivePjeDiscoveries(a.ctx, { sourceOrigin: "https://pje.tjba.jus.br", numbers: [number] });
    const row = (await listPjeDiscoveries(a.ctx)).find(d => d.number === number)!;
    const input = { id: row.id, clientId: client.id, title: "Processo confirmado", area: "Cível" };
    const results = await Promise.all([linkPjeDiscovery(a.ctx, input), linkPjeDiscovery(a.ctx, input)]);
    expect(results[0]?.caseId).toBe(results[1]?.caseId);
    const c = await getCase(a.ctx, results[0]!.caseId);
    expect(c).toMatchObject({ number, nature: "JUDICIAL", confidential: true, area: "Cível" });
    expect(c.parties.some(p => p.clientId === client.id)).toBe(true);
    expect(await db.case.count({ where: { organizationId: a.org.id, number } })).toBe(1);
  });
  it("não revela cadastro sigiloso preexistente na captura de outro membro", async () => {
    const number = cnj("0000003");
    await createCase(a.ctx, { ...base, nature: "JUDICIAL", number, confidential: true });
    const input = { sourceOrigin: "https://pje.tjba.jus.br", numbers: [number] };
    expect(await receivePjeDiscoveries(colleague.ctx, input)).toEqual({ received: 1 });
    const row = (await listPjeDiscoveries(colleague.ctx))[0]!;
    await expect(linkPjeDiscovery(colleague.ctx, { id: row.id })).rejects.toThrow(/Não foi possível vincular/);
  });
  it("emite conexão pessoal de advogado só para captura, revogável sem administrar integrações", async () => {
    const key = await createPersonalPjeKey(colleague.ctx);
    expect((await listPersonalPjeKeys(colleague.ctx)).map(k => k.id)).toContain(key.id);
    const call = (fn: typeof GET, method: string, body?: unknown) => fn(new Request("https://www.legalossync.tech/api/v1/pje/discoveries", { method, headers: { Authorization: `Bearer ${key.token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }), { params: Promise.resolve({}) });
    const identity = await call(GET, "GET"); expect(identity.status).toBe(200); expect(await identity.json()).toMatchObject({ organizationName: a.org.name });
    expect((await call(POST, "POST", { sourceOrigin: "https://pje.tjba.jus.br", numbers: [cnj("0000004")] })).status).toBe(200);
    expect((await call(readCases, "GET")).status).toBe(403);
    await expect(revokePersonalPjeKey(a.ctx, key.id)).rejects.toBeInstanceOf(NotFoundError);
    await revokePersonalPjeKey(colleague.ctx, key.id);
    expect((await call(GET, "GET")).status).toBe(401);
    const assistant = await addMember(a.org.id, "ASSISTANT", "pje-sem-escrita");
    await expect(createPersonalPjeKey(assistant.ctx)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
