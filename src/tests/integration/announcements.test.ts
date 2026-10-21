import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent: { endpoint: string; payload: string }[] = [];
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => undefined,
    sendNotification: async (sub: { endpoint: string }, payload: string) => {
      sent.push({ endpoint: sub.endpoint, payload });
      return { statusCode: 201 };
    },
  },
}));

import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/permissions/check";
import { confirmEnrollment, startEnrollment } from "@/server/services/mfa.service";
import { listAnnouncements, previewAnnouncement, sendAnnouncement } from "@/server/services/announcement.service";
import { savePrefs, subscribe } from "@/server/services/push.service";
import { totpCode, totpStep } from "@/lib/security/totp";
import { addMember, makeOrgWithOwner, makeUser, META } from "./helpers";

const saved = { ...process.env };
const ep = (n: string) => `https://fcm.googleapis.com/fcm/send/${n}-${"x".repeat(30)}`;
const sub = (n: string) => ({ endpoint: ep(n), keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } });
const base = { kind: "INFO" as const, title: "Novidade da plataforma", body: "Agora o LegalOS avisa no celular.", audience: "ALL" as const, viaInApp: true, viaPush: true };

describe("2.0-F15 — comunicados do developer", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let ana: Awaited<ReturnType<typeof addMember>>;
  let pc: { userId: string; meta: typeof META };
  let stranger: { userId: string; meta: typeof META };
  const own = (r: { user: { id: string } }) => r.user.id;

  beforeAll(async () => {
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    process.env.VAPID_PUBLIC_KEY = "BPublicKeyDeTeste".padEnd(87, "x");
    process.env.VAPID_PRIVATE_KEY = "PrivateKeyDeTeste".padEnd(43, "x");
    A = await makeOrgWithOwner("ann-a");
    B = await makeOrgWithOwner("ann-b");
    ana = await addMember(A.org.id, "ASSISTANT", "ann-ana");
    const admin = await makeUser("ann-admin");
    const s = await startEnrollment(admin.id, admin.email);
    await confirmEnrollment(admin.id, totpCode(s.secret, totpStep()), META);
    await db.platformAdmin.create({ data: { userId: admin.id } });
    pc = { userId: admin.id, meta: META };
    const st = await makeUser("ann-stranger");
    stranger = { userId: st.id, meta: META };
    await subscribe(A.ctx, sub("owner-a"));
    await subscribe(ana.ctx, sub("ana"));
    await subscribe(B.ctx, sub("owner-b"));
  });
  beforeEach(() => { sent.length = 0; });
  afterAll(async () => {
    await db.announcement.deleteMany({ where: { createdById: pc.userId } });
    process.env = { ...saved };
  });

  it("só o dono (super-admin com 2FA) usa os comunicados", async () => {
    await expect(previewAnnouncement(stranger, base)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sendAnnouncement(stranger, base, 1)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listAnnouncements(stranger)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("valida os campos: canal obrigatório, link só do sistema, escritório e e-mail conforme o público", async () => {
    await expect(previewAnnouncement(pc, { ...base, viaInApp: false, viaPush: false })).rejects.toBeInstanceOf(ValidationError);
    await expect(previewAnnouncement(pc, { ...base, link: "https://evil.example.com" })).rejects.toBeInstanceOf(ValidationError);
    await expect(previewAnnouncement(pc, { ...base, link: "//evil.example.com" })).rejects.toBeInstanceOf(ValidationError);
    await expect(previewAnnouncement(pc, { ...base, audience: "ORG" })).rejects.toBeInstanceOf(ValidationError);
    await expect(previewAnnouncement(pc, { ...base, audience: "USER" })).rejects.toBeInstanceOf(ValidationError);
    await expect(previewAnnouncement(pc, { ...base, audience: "USER", userEmail: "ninguem@example.test" })).rejects.toBeInstanceOf(ValidationError);
    await expect(previewAnnouncement(pc, { ...base, title: "ab" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("um escritório: conta pessoas e aparelhos, exige confirmar o número, avisa no sino e no celular, uma vez por pessoa", async () => {
    const pv = await previewAnnouncement(pc, { ...base, audience: "ORG", organizationId: A.org.id });
    expect(pv).toEqual({ recipients: 2, devices: 2, pushConfigured: true });
    await expect(sendAnnouncement(pc, { ...base, audience: "ORG", organizationId: A.org.id }, 99)).rejects.toBeInstanceOf(ConflictError);
    const r = await sendAnnouncement(pc, { ...base, audience: "ORG", organizationId: A.org.id, link: "/prazos" }, pv.recipients);
    expect(r).toMatchObject({ recipients: 2, inApp: 2, pushSent: 2, pushFailed: 0 });
    expect(sent.map((s) => s.endpoint).sort()).toEqual([ep("ana"), ep("owner-a")].sort());
    expect(JSON.parse(sent[0]!.payload).url).toBe("/prazos");
    const n = await db.notification.findMany({ where: { organizationId: A.org.id, kind: "announcement.info" } });
    expect(n).toHaveLength(2);
    expect(await db.notification.count({ where: { organizationId: B.org.id, kind: "announcement.info" } })).toBe(0);
    const aud = await db.auditLog.findFirst({ where: { action: "platform.announcement_send", userId: pc.userId }, orderBy: { createdAt: "desc" } });
    expect(aud).toBeTruthy();
    expect(JSON.stringify(aud!.metadata)).not.toContain("Novidade da plataforma"); // o texto não vai para a auditoria
  });

  it("não repete o mesmo título para o mesmo público em 10 minutos", async () => {
    await expect(sendAnnouncement(pc, { ...base, audience: "ORG", organizationId: A.org.id }, 2)).rejects.toBeInstanceOf(ConflictError);
  });

  it("uma pessoa: respeita quem desligou comunicados no celular (sino continua) e escritório suspenso não recebe", async () => {
    await savePrefs(ana.ctx, { deadlines: true, tasks: true, announcements: false, leadDays: 1 });
    const input = { ...base, title: "Aviso só para a Ana", audience: "USER" as const, userEmail: ana.user.email.toUpperCase() };
    const pv = await previewAnnouncement(pc, input);
    expect(pv).toMatchObject({ recipients: 1, devices: 0 });
    const r = await sendAnnouncement(pc, input, 1);
    expect(r).toMatchObject({ inApp: 1, pushSent: 0 });
    expect(sent).toHaveLength(0);
    expect(await db.notification.count({ where: { userId: own(ana), kind: "announcement.info", title: "Aviso só para a Ana" } })).toBe(1);

    await db.organization.update({ where: { id: B.org.id }, data: { suspendedAt: new Date(), suspendedReason: "teste" } });
    await expect(previewAnnouncement(pc, { ...base, title: "Para o escritório B", audience: "ORG", organizationId: B.org.id })).rejects.toBeInstanceOf(ValidationError);
    await db.organization.update({ where: { id: B.org.id }, data: { suspendedAt: null, suspendedReason: null } });
  });

  it("sem as chaves do servidor só envia pelo sistema; limite de 5 por hora; histórico lista o que foi enviado", async () => {
    const keep = process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    await expect(sendAnnouncement(pc, { ...base, title: "Sem chaves", audience: "ORG", organizationId: B.org.id }, 1)).rejects.toBeInstanceOf(ValidationError);
    const r = await sendAnnouncement(pc, { ...base, title: "Só no sistema", audience: "ORG", organizationId: B.org.id, viaPush: false }, 1);
    expect(r).toMatchObject({ inApp: 1, pushSent: 0 });
    process.env.VAPID_PRIVATE_KEY = keep;
    // já foram 3 envios acima (escritório A, Ana, escritório B); completa 5 e o próximo é barrado
    await sendAnnouncement(pc, { ...base, title: "Quarto", audience: "ORG", organizationId: B.org.id, viaPush: false }, 1);
    await sendAnnouncement(pc, { ...base, title: "Quinto", audience: "ORG", organizationId: B.org.id, viaPush: false }, 1);
    await expect(sendAnnouncement(pc, { ...base, title: "Sexto", audience: "ORG", organizationId: B.org.id, viaPush: false }, 1)).rejects.toBeInstanceOf(ConflictError);
    const hist = await listAnnouncements(pc);
    expect(hist.length).toBeGreaterThanOrEqual(5);
    expect(hist[0]).toHaveProperty("recipients");
  });
});
