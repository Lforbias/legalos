import { z } from "zod";

export const CHAT_TRIGGERS = ["NEW_CONVERSATION", "KEYWORD", "OUTSIDE_HOURS", "LABEL_ADDED"] as const;
export type ChatTrigger = (typeof CHAT_TRIGGERS)[number];
export const CHAT_TRIGGER_LABEL: Record<ChatTrigger, string> = {
  NEW_CONVERSATION: "Quando chegar uma conversa nova",
  KEYWORD: "Quando o cliente escrever certas palavras",
  OUTSIDE_HOURS: "Quando chegar mensagem fora do expediente",
  LABEL_ADDED: "Quando uma etiqueta for colocada na conversa",
};

const id = z.string().uuid();
export const chatActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ADD_LABEL"), labelId: id }),
  z.object({ type: z.literal("TRANSFER_QUEUE"), queueId: id }),
  z.object({ type: z.literal("ASSIGN"), userId: id }),
  z.object({ type: z.literal("CREATE_TASK"), title: z.string().trim().min(3, "Título da tarefa: mínimo 3 caracteres.").max(200), dueDays: z.number().int().min(0).max(365), assigneeId: id.nullable() }),
  z.object({ type: z.literal("SEND_REPLY"), text: z.string().trim().min(1, "Escreva a resposta.").max(1000, "Resposta: no máximo 1000 caracteres.") }),
  z.object({ type: z.literal("NOTIFY"), userId: id }),
]);
export type ChatAction = z.infer<typeof chatActionSchema>;
export type ChatActionType = ChatAction["type"];
export const CHAT_ACTION_LABEL: Record<ChatActionType, string> = {
  ADD_LABEL: "Colocar etiqueta",
  TRANSFER_QUEUE: "Mandar para uma fila",
  ASSIGN: "Atribuir a um atendente",
  CREATE_TASK: "Criar tarefa",
  SEND_REPLY: "Responder ao cliente",
  NOTIFY: "Avisar um membro da equipe",
};

export const automationSchema = z.object({
  name: z.string().trim().min(3, "Nome: mínimo 3 caracteres.").max(80, "Nome: no máximo 80 caracteres."),
  trigger: z.enum(CHAT_TRIGGERS),
  triggerValue: z.string().max(1000).nullable().optional(),
  actions: z.array(chatActionSchema).min(1, "Escolha pelo menos uma ação.").max(5, "No máximo 5 ações."),
  oncePerConversation: z.boolean(),
  active: z.boolean(),
});
export type AutomationInput = z.infer<typeof automationSchema>;

/** Placeholders aceitos nos textos: {{contato}} e {{mensagem}}. */
export const PLACEHOLDER_HINT = "Pode usar {{contato}} (nome) e {{mensagem}} (início da mensagem do cliente).";
