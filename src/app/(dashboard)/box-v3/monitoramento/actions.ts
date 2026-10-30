"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { NotFoundError } from "@/lib/permissions/check";
import { boxV3PreviewEnabled } from "@/lib/box-v3-preview";
import { requireTenant } from "@/server/session";
import { acknowledgeBoxV3HealthAlert } from "@/server/judicial/box-v3.service";
import { markBoxV3SyncRunInterrupted } from "@/server/judicial/box-v3.service";

export async function acknowledgeBoxV3HealthAlertAction(formData: FormData) {
  if (!boxV3PreviewEnabled()) throw new NotFoundError("Prévia do Box 3.0 indisponível.");
  const id = formData.get("id");
  if (typeof id !== "string") throw new NotFoundError("Alerta não encontrado.");
  const { ctx } = await requireTenant();
  await acknowledgeBoxV3HealthAlert(ctx, id);
  revalidatePath("/box-v3/monitoramento");
  revalidatePath("/box-v3");
  redirect("/box-v3/monitoramento");
}

export async function markBoxV3SyncRunInterruptedAction(formData: FormData) {
  if (!boxV3PreviewEnabled()) throw new NotFoundError("Prévia do Box 3.0 indisponível.");
  const id = formData.get("id");
  if (typeof id !== "string") throw new NotFoundError("Execução não encontrada.");
  const { ctx } = await requireTenant();
  await markBoxV3SyncRunInterrupted(ctx, id);
  revalidatePath("/box-v3/monitoramento");
  revalidatePath("/box-v3/sincronizacoes");
  revalidatePath(`/box-v3/sincronizacoes/${id}`);
  redirect(`/box-v3/sincronizacoes/${id}`);
}
