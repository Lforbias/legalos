"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { adminUpdateMember, updateCoworkSettings, updateMyProfile } from "@/server/services/cowork-access.service";
import {
  addChannelMembers,
  createChannel,
  createGroup,
  joinChannel,
  leaveChannel,
  markRead,
  openDirect,
  removeChannelMember,
  setChannelArchived,
  setMuted,
  updateChannel,
} from "@/server/services/cowork-channel.service";
import { deleteMessage, editMessage } from "@/server/services/cowork-message.service";
import { addMeetingActionItem, createMeeting, respondMeeting, saveMinutes, setAttendance, setMeetingStatus, updateParticipants } from "@/server/services/cowork-meeting.service";
import { convertMessage } from "@/server/services/cowork-work.service";

/** Ações do Cowork. Todas resolvem o escritório e a pessoa pela sessão no servidor (nunca por ids do navegador). */

const ids = z.array(uuidSchema).max(200);

export async function createChannelAction(input: unknown): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const ch = await createChannel(ctx, input as never);
    return { id: ch.id };
  });
}

export async function createGroupAction(input: unknown): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const ch = await createGroup(ctx, input as never);
    return { id: ch.id };
  });
}

export async function openDirectAction(userId: string): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    return openDirect(ctx, parse(uuidSchema, userId));
  });
}

export async function joinChannelAction(channelId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await joinChannel(ctx, parse(uuidSchema, channelId));
    return undefined;
  });
}

export async function leaveChannelAction(channelId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await leaveChannel(ctx, parse(uuidSchema, channelId));
    return undefined;
  });
}

export async function addMembersAction(channelId: string, userIds: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await addChannelMembers(ctx, parse(uuidSchema, channelId), parse(ids, userIds));
    return undefined;
  });
}

export async function removeMemberAction(channelId: string, userId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await removeChannelMember(ctx, parse(uuidSchema, channelId), parse(uuidSchema, userId));
    return undefined;
  });
}

export async function archiveChannelAction(channelId: string, archived: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setChannelArchived(ctx, parse(uuidSchema, channelId), archived === true);
    return undefined;
  });
}

export async function updateChannelAction(channelId: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await updateChannel(ctx, parse(uuidSchema, channelId), parse(z.object({ name: z.string().max(60).optional(), topic: z.string().max(200).optional() }), input));
    return undefined;
  });
}

export async function muteChannelAction(channelId: string, muted: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setMuted(ctx, parse(uuidSchema, channelId), muted === true);
    return undefined;
  });
}

export async function markReadAction(channelId: string, seq: number): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await markRead(ctx, parse(uuidSchema, channelId), parse(z.number().int().min(0), seq));
    return undefined;
  });
}

export async function editMessageAction(messageId: string, body: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await editMessage(ctx, parse(uuidSchema, messageId), parse(z.string().max(4000), body));
    return undefined;
  });
}

export async function deleteMessageAction(messageId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteMessage(ctx, parse(uuidSchema, messageId));
    return undefined;
  });
}

export async function convertMessageAction(messageId: string, input: unknown): Promise<ActionState<{ taskId: string | null; agendaEventId: string | null }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const item = await convertMessage(ctx, parse(uuidSchema, messageId), input as never);
    revalidatePath("/tarefas");
    revalidatePath("/agenda");
    return { taskId: item.taskId, agendaEventId: item.agendaEventId };
  });
}

export async function createMeetingAction(input: unknown): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const m = await createMeeting(ctx, input as never);
    revalidatePath("/cowork/reunioes");
    revalidatePath("/agenda");
    return { id: m.id };
  });
}

export async function respondMeetingAction(id: string, rsvp: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await respondMeeting(ctx, parse(uuidSchema, id), parse(z.enum(["ACCEPTED", "DECLINED"]), rsvp));
    revalidatePath(`/cowork/reunioes/${id}`);
    return undefined;
  });
}

export async function meetingStatusAction(id: string, action: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setMeetingStatus(ctx, parse(uuidSchema, id), parse(z.enum(["start", "end", "cancel"]), action));
    revalidatePath(`/cowork/reunioes/${id}`);
    revalidatePath("/cowork/reunioes");
    return undefined;
  });
}

export async function attendanceAction(id: string, userId: string, attendance: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setAttendance(ctx, parse(uuidSchema, id), parse(uuidSchema, userId), parse(z.enum(["PRESENT", "ABSENT", "UNKNOWN"]), attendance));
    revalidatePath(`/cowork/reunioes/${id}`);
    return undefined;
  });
}

export async function participantsAction(id: string, userIds: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await updateParticipants(ctx, parse(uuidSchema, id), parse(ids, userIds));
    revalidatePath(`/cowork/reunioes/${id}`);
    return undefined;
  });
}

export async function minutesAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await saveMinutes(ctx, parse(uuidSchema, id), input as never);
    revalidatePath(`/cowork/reunioes/${id}`);
    return undefined;
  });
}

export async function actionItemAction(id: string, input: unknown): Promise<ActionState<{ taskId: string | null; agendaEventId: string | null }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const item = await addMeetingActionItem(ctx, parse(uuidSchema, id), input as never);
    revalidatePath(`/cowork/reunioes/${id}`);
    revalidatePath("/tarefas");
    return { taskId: item.taskId, agendaEventId: item.agendaEventId };
  });
}

export async function updateMyProfileAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await updateMyProfile(ctx, parse(z.object({ displayName: z.string().max(80).optional(), jobTitle: z.string().max(80).optional(), availability: z.string().max(20).optional(), availabilityNote: z.string().max(120).optional() }), input));
    return undefined;
  });
}

export async function adminUpdateMemberAction(userId: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await adminUpdateMember(ctx, parse(uuidSchema, userId), parse(z.object({ department: z.string().max(40).nullable().optional(), jobTitle: z.string().max(80).nullable().optional(), blocked: z.boolean().optional() }), input));
    revalidatePath("/cowork/configuracoes");
    return undefined;
  });
}

export async function updateCoworkSettingsAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await updateCoworkSettings(ctx, parse(z.object({ enabled: z.boolean().optional(), allowDirect: z.boolean().optional(), defaultChannels: z.array(z.string().max(40)).max(10).optional() }), input));
    revalidatePath("/cowork/configuracoes");
    revalidatePath("/cowork");
    return undefined;
  });
}
