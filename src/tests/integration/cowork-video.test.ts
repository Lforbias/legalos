import { createHash } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/permissions/check";
import { roomName, signJwt, verifyJwt, verifyWebhook, liveKitConfig } from "@/server/cowork/livekit";
import { createChannel, ensureWorkspace } from "@/server/services/cowork-channel.service";
import { createMeeting, getMeeting, joinVideo, recordVideoEvent, removeFromVideo, respondMeeting, setMeetingStatus, videoConferenceStatus } from "@/server/services/cowork-meeting.service";
import { addMember, makeOrgWithOwner } from "./helpers";

const SECRET = "segredo-de-teste-do-livekit-com-40-chars!";
let n = 0;
const key = () => `vid${Date.now().toString(36)}${++n}`;

describe("Cowork — videoconferência (LiveKit)", () => {
  let A: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let B: Awaited<ReturnType<typeof makeOrgWithOwner>>;
  let ana: Awaited<ReturnType<typeof addMember>>;
  let bia: Awaited<ReturnType<typeof addMember>>;
  let caio: Awaited<ReturnType<typeof addMember>>;
  let server: http.Server;
  const calls: { path: string; auth: string; body: Record<string, unknown> }[] = [];
  const saved = { ...process.env };

  beforeAll(async () => {
    // Servidor falso da API administrativa do LiveKit: registra as chamadas Twirp.
    server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        calls.push({ path: req.url ?? "", auth: req.headers.authorization ?? "", body: JSON.parse(raw || "{}") as Record<string, unknown> });
        res.writeHead(200, { "Content-Type": "application/json" }).end("{}");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    Object.assign(process.env, { LIVEKIT_URL: `ws://localhost:${port}`, LIVEKIT_API_KEY: "APItest", LIVEKIT_API_SECRET: SECRET, COWORK_VIDEO_ENABLED: "1" });
    A = await makeOrgWithOwner("video-a");
    B = await makeOrgWithOwner("video-b");
    ana = await addMember(A.org.id, "LAWYER", "vid-ana");
    bia = await addMember(A.org.id, "LAWYER", "vid-bia");
    caio = await addMember(A.org.id, "ASSISTANT", "vid-caio");
    for (const c of [A.ctx, ana.ctx, bia.ctx, caio.ctx]) await ensureWorkspace(c);
  });

  afterAll(async () => {
    process.env = saved;
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("sem configuração completa, o vídeo fica desligado e nenhum token é emitido", async () => {
    delete process.env.COWORK_VIDEO_ENABLED;
    expect(videoConferenceStatus().enabled).toBe(false);
    const { id } = await createMeeting(ana.ctx, { title: "Sem vídeo", date: "2030-01-01", startTime: "09:00", participantIds: [bia.user.id], requestKey: key() });
    await setMeetingStatus(ana.ctx, id, "start");
    await expect(joinVideo(ana.ctx, id)).rejects.toBeInstanceOf(ConflictError);
    process.env.COWORK_VIDEO_ENABLED = "1";
    expect(videoConferenceStatus().enabled).toBe(true);
  });

  it("entrada só para convidados, com a reunião em andamento; anfitrião administra a sala", async () => {
    const ch = await createChannel(ana.ctx, { name: "Vídeo time", visibility: "PUBLIC", memberIds: [caio.user.id] });
    const { id } = await createMeeting(ana.ctx, { title: "Chamada", date: "2030-01-02", startTime: "10:00", participantIds: [bia.user.id], channelId: ch.id, requestKey: key() });
    await expect(joinVideo(bia.ctx, id)).rejects.toBeInstanceOf(ConflictError); // ainda agendada
    await setMeetingStatus(ana.ctx, id, "start");
    // Caio vê a reunião pela conversa, mas não foi convidado: não entra na chamada.
    expect((await getMeeting(caio.ctx, id)).isParticipant).toBe(false);
    await expect(joinVideo(caio.ctx, id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(joinVideo(B.ctx, id)).rejects.toBeInstanceOf(NotFoundError);
    const host = await joinVideo(ana.ctx, id);
    const guest = await joinVideo(bia.ctx, id);
    const room = roomName(A.org.id, id);
    expect(host.room).toBe(room);
    const hc = verifyJwt(host.token, SECRET)!;
    const gc = verifyJwt(guest.token, SECRET)!;
    expect(hc).toMatchObject({ iss: "APItest", sub: ana.user.id, video: { room, roomJoin: true, roomAdmin: true } });
    expect(gc).toMatchObject({ sub: bia.user.id, video: { room, roomJoin: true, roomAdmin: false } });
    expect(JSON.stringify(gc)).not.toContain("Chamada"); // o token não carrega o título
    await expect(removeFromVideo(bia.ctx, id, ana.user.id)).rejects.toBeInstanceOf(ForbiddenError);
    calls.length = 0;
    await removeFromVideo(ana.ctx, id, bia.user.id);
    expect(calls[0]).toMatchObject({ path: "/twirp/livekit.RoomService/RemoveParticipant", body: { room, identity: bia.user.id } });
    expect(verifyJwt(calls[0]!.auth.replace("Bearer ", ""), SECRET)).toMatchObject({ video: { room, roomAdmin: true } });
    // Encerrar a reunião encerra a sala no servidor de mídia.
    calls.length = 0;
    await setMeetingStatus(ana.ctx, id, "end");
    expect(calls.some((c) => c.path === "/twirp/livekit.RoomService/DeleteRoom" && c.body.room === room)).toBe(true);
    await expect(joinVideo(bia.ctx, id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("quem recusou não entra; ao confirmar, entra", async () => {
    const { id } = await createMeeting(ana.ctx, { title: "Recusa", date: "2030-01-03", startTime: "10:00", participantIds: [bia.user.id], requestKey: key() });
    await respondMeeting(bia.ctx, id, "DECLINED");
    await setMeetingStatus(ana.ctx, id, "start");
    await expect(joinVideo(bia.ctx, id)).rejects.toBeInstanceOf(ConflictError);
    await respondMeeting(bia.ctx, id, "ACCEPTED");
    await expect(joinVideo(bia.ctx, id)).resolves.toMatchObject({ isHost: false });
  });

  it("presença verificável pelo webhook assinado: só participante da sala certa, só em reunião em andamento", async () => {
    const { id } = await createMeeting(ana.ctx, { title: "Presença", date: "2030-01-04", startTime: "10:00", participantIds: [bia.user.id], requestKey: key() });
    const room = roomName(A.org.id, id);
    const ev = (identity: string, r = room) => ({ event: "participant_joined", room: { name: r }, participant: { identity } });
    expect((await recordVideoEvent(ev(bia.user.id))).updated).toBe(0); // agendada
    await setMeetingStatus(ana.ctx, id, "start");
    expect((await recordVideoEvent(ev(caio.user.id))).updated).toBe(0); // não convidado
    expect((await recordVideoEvent(ev(bia.user.id, roomName(B.org.id, id)))).updated).toBe(0); // prefixo de outro escritório
    expect((await recordVideoEvent({ ...ev(bia.user.id), event: "participant_left" })).updated).toBe(0);
    expect((await recordVideoEvent(ev(bia.user.id))).updated).toBe(1);
    const p = await db.coworkMeetingParticipant.findUniqueOrThrow({ where: { meetingId_userId: { meetingId: id, userId: bia.user.id } } });
    expect(p).toMatchObject({ attendance: "PRESENT", attendanceById: null });
    // Assinatura do webhook: corpo adulterado é recusado.
    const c = liveKitConfig();
    if (!c.ok) throw new Error("config");
    const body = JSON.stringify(ev(ana.user.id));
    const auth = signJwt({ iss: "APItest", sha256: createHash("sha256").update(body).digest("base64") }, SECRET);
    expect(verifyWebhook(c.config, body, `Bearer ${auth}`)).not.toBeNull();
    expect(verifyWebhook(c.config, body.replace(ana.user.id, caio.user.id), `Bearer ${auth}`)).toBeNull();
  });
});
