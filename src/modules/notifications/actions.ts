"use server";

import { revalidatePath } from "next/cache";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { markAllRead, markRead } from "@/server/services/notification.service";

export async function markNotificationReadAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await markRead(ctx, parse(uuidSchema, id));
    revalidatePath("/notificacoes");
    return undefined;
  });
}

export async function markAllNotificationsReadAction(): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await markAllRead(ctx);
    revalidatePath("/notificacoes");
    return undefined;
  });
}
