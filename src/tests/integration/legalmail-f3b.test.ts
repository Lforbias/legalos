import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { DOCX_MIME, DRIVE_SCOPE, GOOGLE_DOC_MIME } from "@/lib/google/drive";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/permissions/check";
import { totpCode, totpStep } from "@/lib/security/totp";
import { createCase } from "@/server/services/case.service";
import { getDocument, uploadDocument } from "@/server/services/document.service";
import {
  deleteDriveIntegration, disconnectDrive, driveEnabled, finishDriveConnect, getDocumentDriveLink, getDriveSettings, makeState, pullDocumentFromDrive, readState, saveDriveCredentials, sendDocumentToDrive, setDriveEnabled, startDriveConnect, unlinkDocumentDrive,
} from "@/server/services/google-drive.service";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { META, addMember, makeOrgWithOwner } from "./helpers";

const KEY = Buffer.alloc(32, 3).toString("base64");
const base = { legacyNumber: "", number: "", title: "Caso", area: "", court: "", courtUnit: "", courtState: "", subject: "", claimValue: "", status: "ACTIVE" as const, phase: "", distributedAt: "", confidential: false, notes: "", responsibleId: "", clientId: "", clientRole: "PLAINTIFF" as const };
const CLIENT_ID = "1234567890-abcdefg.apps.googleusercontent.com";
const SECRET = "GOCSPX-segredo-do-escritorio-A";
const docxBytes = (tag: string) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(`docx-${tag}`)]);

type Call = { url: string; method: string; auth?: string; body?: string };

/** Google falso: guarda o que recebeu e responde como a API real responderia. */
function fakeGoogle(opts: { secretOk?: string; omitRefresh?: boolean } = {}) {
  const calls: Call[] = [];
  const files = new Map<string, { name: string; mime: string; bytes: Buffer; doc: boolean }>();
  let folders = 0;
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    const raw = init?.body;
    const body = typeof raw === "string" ? raw : raw instanceof Uint8Array ? Buffer.from(raw).toString("latin1") : undefined;
    calls.push({ url, method, auth, body });
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      const p = new URLSearchParams(body);
      if (opts.secretOk && p.get("client_secret") !== opts.secretOk) return json({ error: "invalid_client" }, 401);
      if (p.get("grant_type") === "refresh_token") return p.get("refresh_token") === "REFRESH-1" ? json({ access_token: "ACCESS-1" }) : json({ error: "invalid_grant" }, 400);
      return json({ access_token: "ACCESS-1", ...(opts.omitRefresh ? {} : { refresh_token: "REFRESH-1" }), scope: DRIVE_SCOPE });
    }
    if (url.startsWith("https://oauth2.googleapis.com/revoke")) return json({});
    if (url.includes("/drive/v3/files?q=")) return json({ files: folders ? [{ id: "FOLDER-1" }] : [] });
    if (url.includes("/drive/v3/files?fields=id") && method === "POST") { folders++; return json({ id: "FOLDER-1" }); }
    if (url.includes("/upload/drive/v3/files")) {
      const meta = JSON.parse(/\r\n\r\n(\{.*?\})\r\n--/s.exec(body ?? "")![1]!) as { name: string; mimeType?: string; parents: string[] };
      const id = `FILE-${files.size + 1}`;
      const doc = meta.mimeType === GOOGLE_DOC_MIME;
      files.set(id, { name: meta.name, mime: meta.mimeType ?? "x", bytes: Buffer.from(body ?? "", "latin1"), doc });
      return json({ id, webViewLink: `https://docs.google.com/${id}`, mimeType: doc ? GOOGLE_DOC_MIME : "application/pdf" });
    }
    const exp = /\/files\/([^/?]+)(\/export)?/.exec(url);
    if (exp) {
      const file = files.get(decodeURIComponent(exp[1]!));
      if (!file) return json({ error: { message: "not found" } }, 404);
      return new Response(Buffer.from("PK\u0003\u0004editado-no-google"), { status: 200 });
    }
    return json({ error: { message: "rota inesperada" } }, 500);
  }) as typeof fetch;
  return { f, calls, files };
}

async function mfa(userId: string, email: string) {
  process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  const s = await startEnrollment(userId, email);
  await confirmEnrollment(userId, totpCode(s.secret, totpStep()), META);
}

describe("3.0-F3b — Google Drive/Docs opcional, por escritório", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let lawyer: Awaited<ReturnType<typeof addMember>>;
  let caseId: string;
  let secretCase: string;

  beforeAll(async () => {
    process.env.CERT_ENCRYPTION_KEY = KEY;
    process.env.APP_URL = "https://app.exemplo.test";
    A = await makeOrgWithOwner("l3f3b-a");
    B = await makeOrgWithOwner("l3f3b-b");
    lawyer = await addMember(A.org.id, "LAWYER", "l3f3b-adv");
    for (const o of [A, B]) {
      const u = await db.user.findUniqueOrThrow({ where: { id: o.ctx.userId } });
      await mfa(u.id, u.email);
    }
    caseId = (await createCase(lawyer.ctx, { ...base, title: "Comum" })).id;
    secretCase = (await createCase(A.ctx, { ...base, title: "Sigiloso", confidential: true })).id;
  });

  it("nasce desligado e só administrador de integrações mexe; credenciais validadas e cifradas", async () => {
    expect(await driveEnabled(A.ctx)).toBe(false);
    await expect(getDriveSettings(lawyer.ctx)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveDriveCredentials(lawyer.ctx, { clientId: CLIENT_ID, clientSecret: SECRET })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveDriveCredentials(A.ctx, { clientId: "curto", clientSecret: SECRET })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveDriveCredentials(A.ctx, { clientId: CLIENT_ID, clientSecret: "x" })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveDriveCredentials(A.ctx, { clientId: CLIENT_ID, clientSecret: SECRET, folderName: "a/b" })).rejects.toBeInstanceOf(ValidationError);
    await expect(setDriveEnabled(A.ctx, true)).rejects.toBeInstanceOf(NotFoundError); // sem credenciais
    await saveDriveCredentials(A.ctx, { clientId: CLIENT_ID, clientSecret: SECRET, folderName: "Escritório A" });
    const raw = await db.googleIntegration.findUniqueOrThrow({ where: { organizationId: A.org.id } });
    expect(raw.clientSecretEnc).not.toContain(SECRET);
    expect(raw.clientSecretEnc).not.toContain(Buffer.from(SECRET).toString("base64"));
    const s = await getDriveSettings(A.ctx);
    expect(JSON.stringify(s)).not.toContain(SECRET);
    expect(s).toMatchObject({ hasCredentials: true, connected: false, enabled: false, folderName: "Escritório A", redirectUri: "https://app.exemplo.test/api/integrations/google/callback" });
    await expect(setDriveEnabled(A.ctx, true)).rejects.toBeInstanceOf(ConflictError); // credenciais sem conexão
    expect((await getDriveSettings(B.ctx)).hasCredentials).toBe(false); // cada escritório com o seu
  });

  it("consentimento: URL pede só drive.file; estado é assinado, expira e é amarrado a quem pediu", async () => {
    const { url } = await startDriveConnect(A.ctx);
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("scope")).toBe(DRIVE_SCOPE);
    expect(u.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(u.searchParams.get("redirect_uri")).toBe("https://app.exemplo.test/api/integrations/google/callback");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(url).not.toContain(SECRET);
    const state = u.searchParams.get("state")!;
    expect(readState(state)).toEqual({ organizationId: A.org.id, userId: A.ctx.userId });
    expect(readState(state + "x")).toBeNull();
    expect(readState(`${state.split(".")[0]}.assinatura-falsa`)).toBeNull();
    expect(readState(makeState(A.ctx, Date.now() - 11 * 60_000))).toBeNull(); // expirado
    await expect(startDriveConnect(B.ctx)).rejects.toBeInstanceOf(NotFoundError);
    const g = fakeGoogle();
    await expect(finishDriveConnect(B.ctx, { state, code: "c" }, g.f)).rejects.toBeInstanceOf(ValidationError); // estado de A não vale para B
    await expect(finishDriveConnect(A.ctx, { state: "lixo", code: "c" }, g.f)).rejects.toBeInstanceOf(ValidationError);
    expect(g.calls).toHaveLength(0);
  });

  it("conectar: recusa segredo errado e falta de autorização permanente; sucesso guarda token cifrado e cria a pasta", async () => {
    const state = makeState(A.ctx);
    await expect(finishDriveConnect(A.ctx, { state, code: "c" }, fakeGoogle({ secretOk: "outro" }).f)).rejects.toThrow(/Client ID ou o Client Secret/);
    expect((await getDriveSettings(A.ctx)).lastError).toMatch(/Client/);
    await expect(finishDriveConnect(A.ctx, { state, code: "c" }, fakeGoogle({ omitRefresh: true }).f)).rejects.toThrow(/autorização permanente/);
    const g = fakeGoogle({ secretOk: SECRET });
    await finishDriveConnect(A.ctx, { state, code: "CODE-1" }, g.f);
    const raw = await db.googleIntegration.findUniqueOrThrow({ where: { organizationId: A.org.id } });
    expect(raw.refreshTokenEnc).toBeTruthy();
    expect(raw.refreshTokenEnc).not.toContain("REFRESH-1");
    expect(raw.folderId).toBe("FOLDER-1");
    expect((await getDriveSettings(A.ctx)).lastError).toBeNull();
    const tokenCall = g.calls.find((c) => c.url.includes("/token"))!;
    expect(new URLSearchParams(tokenCall.body).get("code")).toBe("CODE-1");
    await setDriveEnabled(A.ctx, true);
    expect(await driveEnabled(A.ctx)).toBe(true);
    expect(await driveEnabled(B.ctx)).toBe(false);
  });

  it("enviar: só com o Drive ligado; sigiloso recusado; Google Docs só para formatos conversíveis; guarda o link", async () => {
    const pdf = await uploadDocument(lawyer.ctx, { caseId }, { name: "peca.pdf", buffer: Buffer.from("%PDF-1.4\n% x\n%%EOF") });
    const docx = await uploadDocument(lawyer.ctx, { caseId }, { name: "minuta.docx", buffer: docxBytes("v1") });
    const sec = await uploadDocument(A.ctx, { caseId: secretCase }, { name: "sigilo.docx", buffer: docxBytes("sigilo") });
    const g = fakeGoogle();
    await expect(sendDocumentToDrive(A.ctx, sec.id, {}, g.f)).rejects.toThrow(/sigilosos/); // quem vê o sigiloso também não envia
    await expect(sendDocumentToDrive(lawyer.ctx, sec.id, {}, g.f)).rejects.toBeInstanceOf(NotFoundError); // e quem não vê nem o encontra
    await expect(sendDocumentToDrive(lawyer.ctx, pdf.id, { asGoogleDoc: true }, g.f)).rejects.toBeInstanceOf(ValidationError);
    expect(g.calls.some((c) => c.url.includes("/upload/"))).toBe(false); // nada saiu
    const r1 = await sendDocumentToDrive(lawyer.ctx, pdf.id, {}, g.f);
    expect(r1.isGoogleDoc).toBe(false);
    const r2 = await sendDocumentToDrive(lawyer.ctx, docx.id, { asGoogleDoc: true }, g.f);
    expect(r2).toMatchObject({ isGoogleDoc: true, link: expect.stringContaining("docs.google.com") });
    const up = g.calls.filter((c) => c.url.includes("/upload/"));
    expect(up.every((c) => c.auth === "Bearer ACCESS-1")).toBe(true);
    expect(up[1]!.body).toContain(GOOGLE_DOC_MIME);
    expect(up[1]!.body).toContain("minuta.docx");
    expect((await getDocumentDriveLink(lawyer.ctx, docx.id))).toMatchObject({ isGoogleDoc: true, sentVersion: 1 });
    await expect(getDocumentDriveLink(B.ctx, docx.id)).rejects.toBeInstanceOf(NotFoundError); // outro escritório
    await expect(sendDocumentToDrive(B.ctx, docx.id, {}, g.f)).rejects.toBeInstanceOf(NotFoundError);
    const outsiderRole = await addMember(A.org.id, "CLIENT", "l3f3b-cli");
    await expect(sendDocumentToDrive(outsiderRole.ctx, docx.id, {}, g.f)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("trazer de volta cria nova versão e preserva a anterior; sem envio prévio recusa; esquecer remove a ligação", async () => {
    const d = await uploadDocument(lawyer.ctx, { caseId }, { name: "contrato.docx", buffer: docxBytes("orig") });
    const g = fakeGoogle();
    await expect(pullDocumentFromDrive(lawyer.ctx, d.id, g.f)).rejects.toBeInstanceOf(ConflictError);
    await sendDocumentToDrive(lawyer.ctx, d.id, { asGoogleDoc: true }, g.f);
    const r = await pullDocumentFromDrive(lawyer.ctx, d.id, g.f);
    expect(r.version).toBe(2);
    const data = await getDocument(lawyer.ctx, d.id);
    expect(data.doc.currentVersion).toBe(2);
    expect(data.versions.map((v) => v.version)).toEqual([2, 1]);
    expect(data.versions[0]).toMatchObject({ fileName: "contrato.docx", note: "Trazido do Google Drive" });
    expect((await getDocumentDriveLink(lawyer.ctx, d.id))?.pulledAt).toBeTruthy();
    await unlinkDocumentDrive(lawyer.ctx, d.id);
    expect(await getDocumentDriveLink(lawyer.ctx, d.id)).toBeNull();
    await expect(unlinkDocumentDrive(lawyer.ctx, d.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(DOCX_MIME).toContain("wordprocessingml");
  });

  it("desconectar revoga no Google e trava o uso; apagar remove tudo", async () => {
    const d = await uploadDocument(lawyer.ctx, { caseId }, { name: "outro.docx", buffer: docxBytes("z") });
    const g = fakeGoogle();
    await disconnectDrive(A.ctx, g.f);
    expect(g.calls.some((c) => c.url.includes("/revoke") && new URLSearchParams(c.body).get("token") === "REFRESH-1")).toBe(true);
    expect(await driveEnabled(A.ctx)).toBe(false);
    expect((await db.googleIntegration.findUniqueOrThrow({ where: { organizationId: A.org.id } })).refreshTokenEnc).toBeNull();
    await expect(sendDocumentToDrive(lawyer.ctx, d.id, {}, g.f)).rejects.toBeInstanceOf(ConflictError);
    await expect(deleteDriveIntegration(lawyer.ctx, g.f)).rejects.toBeInstanceOf(ForbiddenError);
    await deleteDriveIntegration(A.ctx, g.f);
    expect(await db.googleIntegration.count({ where: { organizationId: A.org.id } })).toBe(0);
  });
});
