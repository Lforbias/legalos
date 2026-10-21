import { db } from "@/lib/db/client";
import { ValidationError } from "@/lib/permissions/check";
import { triageRuleName, triageSchema, TRIAGE_AREAS } from "@/modules/whatsapp/triage-schema";
import type { ChatAction } from "@/modules/whatsapp/automation-schema";
import { assertCan, type TenantContext } from "@/server/context";
import { saveAutomation } from "./chat-automation.service";

/**
 * Modelo de triagem por área: cria uma automação de PALAVRAS-CHAVE por área (fila e/ou atendente). As regras nascem DESLIGADAS;
 * quem liga é o escritório, na lista de automações. Não usa IA e não escreve ao cliente (só encaminha a conversa).
 * Se o cliente citar mais de uma área, vale a última regra que disparar; a conversa nunca fica sem dono (fila padrão).
 */
export async function createTriageRules(ctx: TenantContext, raw: unknown): Promise<{ created: string[]; skipped: string[] }> {
  assertCan(ctx, "whatsapp:manage");
  const p = triageSchema.safeParse(raw);
  if (!p.success) throw new ValidationError("Dados do modelo inválidos.");
  const created: string[] = [];
  const skipped: string[] = [];
  for (const a of p.data.areas) {
    const def = TRIAGE_AREAS.find((x) => x.key === a.key)!;
    const name = triageRuleName(def.label);
    if (!a.queueId && !a.userId) throw new ValidationError(`${def.label}: escolha uma fila, um atendente, ou os dois.`);
    if (await db.whatsappAutomation.findFirst({ where: { organizationId: ctx.organizationId, name }, select: { id: true } })) { skipped.push(def.label); continue; }
    const actions: ChatAction[] = [];
    if (a.queueId) actions.push({ type: "TRANSFER_QUEUE", queueId: a.queueId });
    if (a.userId) actions.push({ type: "ASSIGN", userId: a.userId });
    await saveAutomation(ctx, null, { name, trigger: "KEYWORD", triggerValue: a.keywords, actions, oncePerConversation: true, active: false });
    created.push(def.label);
  }
  return { created, skipped };
}
