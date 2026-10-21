"use server";

import { revalidatePath } from "next/cache";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { requireTenant } from "@/server/session";
import { createTemplate, deleteTemplate, generateFromTemplate, updateTemplate } from "@/server/services/template.service";
import { generateSchema, templateSchema } from "./schemas";

const toInput = (v: ReturnType<typeof templateSchema.parse>) => ({ name: v.name, description: v.description, category: v.category, body: v.body, active: v.active });

export async function createTemplateAction(input: unknown): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const t = await createTemplate(ctx, toInput(parse(templateSchema, input)));
    revalidatePath("/documentos/modelos");
    return { id: t.id };
  });
}

export async function updateTemplateAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await updateTemplate(ctx, parse(uuidSchema, id), toInput(parse(templateSchema, input)));
    revalidatePath("/documentos/modelos");
    revalidatePath(`/documentos/modelos/${id}`);
    return undefined;
  });
}

export async function deleteTemplateAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteTemplate(ctx, parse(uuidSchema, id));
    revalidatePath("/documentos/modelos");
    return undefined;
  });
}

export async function generateDocumentAction(input: unknown): Promise<ActionState<{ id: string; missing: string[] }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const v = parse(generateSchema, input);
    const owner = v.target === "case" ? { caseId: v.caseId } : { clientId: v.clientId };
    const res = await generateFromTemplate(ctx, v.templateId, owner, v.title);
    revalidatePath("/documentos");
    if (v.target === "case") revalidatePath(`/processos/${v.caseId}`);
    else revalidatePath(`/clientes/${v.clientId}`);
    return res;
  });
}
