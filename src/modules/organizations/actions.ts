"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/validation/common";
import { uuidSchema } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { getRequestMeta, requireSession, requireTenant } from "@/server/session";
import { setActiveOrganization } from "@/server/services/auth.service";
import { createOrganization, setRequireMfa, updateOrganization } from "@/server/services/organization.service";
import { createOrganizationSchema, updateOrganizationSchema } from "./schemas";

export async function createOrganizationAction(input: unknown): Promise<ActionState<{ redirectTo: string }>> {
  return runAction(async () => {
    const session = await requireSession();
    const data = parse(createOrganizationSchema, input);
    const org = await createOrganization(
      session.user.id,
      { name: data.name, legalName: data.legalName || null, timezone: data.timezone },
      await getRequestMeta(),
    );
    await setActiveOrganization(session.user.id, session.id, org.id);
    return { redirectTo: "/" };
  });
}

export async function switchOrganizationAction(organizationId: string): Promise<ActionState> {
  return runAction(async () => {
    const session = await requireSession();
    await setActiveOrganization(session.user.id, session.id, parse(uuidSchema, organizationId));
    revalidatePath("/", "layout");
    return undefined;
  });
}

export async function updateOrganizationAction(input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const data = parse(updateOrganizationSchema, input);
    await updateOrganization(ctx, {
      name: data.name,
      legalName: data.legalName || null,
      document: data.document || null,
      timezone: data.timezone,
    });
    revalidatePath("/", "layout");
    return undefined;
  });
}

export async function setRequireMfaAction(required: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await setRequireMfa(ctx, parse(z.boolean(), required));
    revalidatePath("/configuracoes/seguranca");
    return undefined;
  });
}
