"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema, type ActionState } from "@/lib/validation/common";
import { parse, runAction } from "@/server/action-helpers";
import { addColumn, archiveBoard, createBoard, createCard, deleteCard, deleteColumn, moveCard, renameBoard, renameColumn, shiftColumn, updateCard } from "@/server/services/kanban.service";
import { deletePackage, runPackage, savePackage } from "@/server/services/workflow-package.service";
import { requireTenant } from "@/server/session";
import { boardNameSchema, cardSchema, columnNameSchema } from "./schemas";
import { packageSchema, runSchema } from "./package-schemas";

const touch = () => {
  revalidatePath("/gestao");
  revalidatePath("/configuracoes/pacotes");
  revalidatePath("/tarefas");
};

export async function createBoardAction(name: string): Promise<ActionState<{ id: string }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const id = await createBoard(ctx, parse(boardNameSchema, name));
    touch();
    return { id };
  });
}
export async function renameBoardAction(id: string, name: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await renameBoard(ctx, parse(uuidSchema, id), parse(boardNameSchema, name));
    touch();
    return undefined;
  });
}
export async function archiveBoardAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await archiveBoard(ctx, parse(uuidSchema, id));
    touch();
    return undefined;
  });
}
export async function addColumnAction(boardId: string, name: string, isDone: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await addColumn(ctx, parse(uuidSchema, boardId), parse(columnNameSchema, name), isDone);
    touch();
    return undefined;
  });
}
export async function renameColumnAction(id: string, name: string, isDone: boolean): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await renameColumn(ctx, parse(uuidSchema, id), parse(columnNameSchema, name), isDone);
    touch();
    return undefined;
  });
}
export async function shiftColumnAction(id: string, dir: number): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await shiftColumn(ctx, parse(uuidSchema, id), parse(z.union([z.literal(-1), z.literal(1)]), dir));
    touch();
    return undefined;
  });
}
export async function deleteColumnAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteColumn(ctx, parse(uuidSchema, id));
    touch();
    return undefined;
  });
}
export async function createCardAction(boardId: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await createCard(ctx, parse(uuidSchema, boardId), parse(cardSchema, input));
    touch();
    return undefined;
  });
}
export async function updateCardAction(id: string, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await updateCard(ctx, parse(uuidSchema, id), parse(cardSchema, input));
    touch();
    return undefined;
  });
}
export async function moveCardAction(id: string, columnId: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await moveCard(ctx, parse(uuidSchema, id), parse(uuidSchema, columnId));
    touch();
    return undefined;
  });
}
export async function deleteCardAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deleteCard(ctx, parse(uuidSchema, id));
    touch();
    return undefined;
  });
}

export async function savePackageAction(id: string | null, input: unknown): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await savePackage(ctx, id ? parse(uuidSchema, id) : null, parse(packageSchema, input));
    touch();
    return undefined;
  });
}
export async function deletePackageAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    await deletePackage(ctx, parse(uuidSchema, id));
    touch();
    return undefined;
  });
}
export async function runPackageAction(packageId: string, input: unknown): Promise<ActionState<{ created: number; failed: string[] }>> {
  return runAction(async () => {
    const { ctx } = await requireTenant();
    const r = await runPackage(ctx, parse(uuidSchema, packageId), parse(runSchema, input));
    touch();
    return { created: r.created, failed: r.failed };
  });
}
