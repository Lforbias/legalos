import { db } from "@/lib/db/client";
import { ConflictError } from "@/lib/permissions/check";

export async function chatContactBlocked(organizationId: string, accountId: string, waId: string) {
  const rows = await db.$queryRaw<{blocked: boolean}[]>`SELECT blocked FROM chat_contact_controls WHERE organization_id=${organizationId}::uuid AND account_id=${accountId}::uuid AND wa_id=${waId}`;
  return rows[0]?.blocked ?? false;
}
export async function assertChatContactAllowed(organizationId: string, accountId: string, waId: string) {
  if (await chatContactBlocked(organizationId, accountId, waId)) throw new ConflictError("Contato bloqueado neste número. Revise o bloqueio no atendimento antes de enviar.");
}
