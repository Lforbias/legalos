/**
 * Comunicados do DEVELOPER (2.0-F15): novidade, manutenção ou alerta, por aviso no sistema (sino) e/ou no celular (push).
 * Só super-admin com 2FA. O texto é escrito pelo developer e passa pelo serviço de push (Google/Apple/Mozilla):
 * por isso a tela avisa para NÃO colocar dados de clientes. Cada pessoa recebe no máximo uma vez; quem desligou
 * "comunicados" nas preferências do celular não recebe push (o aviso no sistema continua no sino).
 * O envio exige conferir antes quantas pessoas vão receber e confirmar esse número.
 */
import { db } from "@/lib/db/client";
import { ConflictError, ValidationError } from "@/lib/permissions/check";
import { announcementSchema, type AnnouncementInput } from "@/modules/platform/announcement-schema";
import { audit } from "./audit.service";
import { notify } from "./notification.service";
import { assertPlatform, type PlatformCtx } from "./platform.service";
import { sendToSub, setup } from "./push.service";

const MAX_PER_HOUR = 5;
const DUP_WINDOW_MS = 10 * 60_000;
const KIND_PREFIX = { INFO: "", MAINTENANCE: "Manutenção: ", ALERT: "Alerta: " } as const;

function parseInput(raw: unknown): AnnouncementInput {
  const p = announcementSchema.safeParse(raw);
  if (!p.success) {
    const fe: Record<string, string[]> = {};
    for (const i of p.error.issues) (fe[String(i.path[0] ?? "form")] ??= []).push(i.message);
    throw new ValidationError("Corrija os campos destacados.", fe);
  }
  return p.data;
}

type Recipient = { userId: string; organizationId: string };

/** Cada pessoa uma vez (no primeiro escritório ativo dela). Ignora escritórios suspensos/apagados e usuários desativados. */
async function resolveRecipients(v: AnnouncementInput): Promise<Recipient[]> {
  const where = {
    status: "ACTIVE" as const,
    user: { disabledAt: null },
    organization: { deletedAt: null, suspendedAt: null },
    ...(v.audience === "ORG" ? { organizationId: v.organizationId! } : {}),
    ...(v.audience === "USER" ? { user: { disabledAt: null, email: { equals: v.userEmail!, mode: "insensitive" as const } } } : {}),
  };
  const rows = await db.membership.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { userId: true, organizationId: true } });
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const r of rows) {
    if (seen.has(r.userId)) continue;
    seen.add(r.userId);
    out.push(r);
  }
  if (v.audience === "ORG" && !out.length) throw new ValidationError("Este escritório não tem membros ativos (ou está suspenso).", { organizationId: ["Sem destinatários."] });
  if (v.audience === "USER" && !out.length) throw new ValidationError("Nenhuma pessoa ativa com esse e-mail.", { userEmail: ["Pessoa não encontrada."] });
  return out;
}

async function pushTargets(userIds: string[]) {
  if (!userIds.length) return [];
  const optedOut = await db.pushPreference.findMany({ where: { userId: { in: userIds }, announcements: false }, select: { userId: true } });
  const out = new Set(optedOut.map((o) => o.userId));
  const subs = await db.pushSubscription.findMany({ where: { userId: { in: userIds.filter((u) => !out.has(u)) } }, select: { id: true, userId: true, endpoint: true, p256dh: true, auth: true, failures: true } });
  return subs;
}

export type AnnouncementPreview = { recipients: number; devices: number; pushConfigured: boolean };

export async function previewAnnouncement(pc: PlatformCtx, raw: unknown): Promise<AnnouncementPreview> {
  await assertPlatform(pc);
  const v = parseInput(raw);
  const rec = await resolveRecipients(v);
  const devices = v.viaPush ? (await pushTargets(rec.map((r) => r.userId))).length : 0;
  return { recipients: rec.length, devices, pushConfigured: setup() };
}

export async function sendAnnouncement(pc: PlatformCtx, raw: unknown, confirmRecipients: number, now = new Date()) {
  await assertPlatform(pc);
  const v = parseInput(raw);
  if (v.viaPush && !setup()) throw new ValidationError("As chaves de aviso no celular não estão configuradas no servidor (docs/push.md). Envie só pelo sistema ou configure as chaves.", { viaPush: ["Chaves não configuradas."] });
  const sentLastHour = await db.announcement.count({ where: { createdById: pc.userId, createdAt: { gte: new Date(now.getTime() - 3_600_000) } } });
  if (sentLastHour >= MAX_PER_HOUR) throw new ConflictError(`Limite de ${MAX_PER_HOUR} comunicados por hora. Aguarde um pouco.`);
  const dup = await db.announcement.findFirst({ where: { title: v.title, audience: v.audience, organizationId: v.audience === "ORG" ? v.organizationId : null, createdAt: { gte: new Date(now.getTime() - DUP_WINDOW_MS) } }, select: { id: true } });
  if (dup) throw new ConflictError("Um comunicado com este título e este público acabou de ser enviado. Aguarde 10 minutos para repetir.");
  const rec = await resolveRecipients(v);
  if (rec.length !== confirmRecipients) throw new ConflictError(`O número de destinatários mudou (${rec.length}). Confira de novo antes de enviar.`);

  const target = v.audience === "USER" ? rec[0]!.userId : null;
  const ann = await db.announcement.create({
    data: { kind: v.kind, title: v.title, body: v.body, link: v.link, audience: v.audience, organizationId: v.audience === "ORG" ? v.organizationId! : null, targetUserId: target, viaInApp: v.viaInApp, viaPush: v.viaPush, recipients: rec.length, createdById: pc.userId },
  });

  let inApp = 0;
  if (v.viaInApp) {
    inApp = await notify(rec.map((r) => ({ organizationId: r.organizationId, userId: r.userId, kind: `announcement.${v.kind.toLowerCase()}`, title: `${KIND_PREFIX[v.kind]}${v.title}`, body: v.body, link: v.link, dedupeKey: `announcement:${ann.id}` })));
  }
  let pushSent = 0;
  let pushFailed = 0;
  if (v.viaPush) {
    const subs = await pushTargets(rec.map((r) => r.userId));
    const payload = { title: `${KIND_PREFIX[v.kind]}${v.title}`.slice(0, 80), body: v.body.length > 140 ? `${v.body.slice(0, 137)}...` : v.body, url: v.link ?? "/notificacoes", tag: `legalos-ann-${ann.id.slice(0, 8)}` };
    for (let i = 0; i < subs.length; i += 10) {
      const results = await Promise.all(subs.slice(i, i + 10).map((s) => sendToSub(s, payload)));
      for (const r of results) {
        if (r === "ok") pushSent++;
        else pushFailed++;
      }
    }
  }
  await db.announcement.update({ where: { id: ann.id }, data: { inAppCount: inApp, pushSent, pushFailed } });
  await audit({ action: "platform.announcement_send", userId: pc.userId, resourceType: "announcement", resourceId: ann.id, metadata: { audience: v.audience, kind: v.kind, recipients: rec.length, inApp, pushSent, pushFailed }, meta: pc.meta });
  return { id: ann.id, recipients: rec.length, inApp, pushSent, pushFailed };
}

export async function listAnnouncements(pc: PlatformCtx, take = 20) {
  await assertPlatform(pc);
  return db.announcement.findMany({ orderBy: { createdAt: "desc" }, take: Math.min(take, 100), select: { id: true, kind: true, title: true, audience: true, viaInApp: true, viaPush: true, recipients: true, inAppCount: true, pushSent: true, pushFailed: true, createdAt: true, organization: { select: { name: true } } } });
}
