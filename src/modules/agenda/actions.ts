"use server";

import { revalidatePath } from "next/cache";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { createEvent, deleteEvent, updateEvent } from "@/server/services/agenda.service";
import { eventSchema } from "./schemas";

const touch = () => {
  revalidatePath("/agenda");
  revalidatePath("/");
};

export async function createEventAction(input: unknown): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const e = await createEvent(ctx, parse(eventSchema, input));
    touch();
    return { id: e.id };
  });
}

export async function updateEventAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await updateEvent(ctx, parse(uuidSchema, id), parse(eventSchema, input));
    touch();
    return undefined;
  });
}

export async function deleteEventAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteEvent(ctx, parse(uuidSchema, id));
    touch();
    return undefined;
  });
}
