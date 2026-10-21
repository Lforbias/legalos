import { z } from "zod";
import { chatActionSchema } from "./automation-schema";

const id = z.string().uuid();
/** Ações permitidas na opção do menu: as do Chat, menos "responder" (a resposta da opção já cobre isso). */
export const botActionSchema = chatActionSchema.refine((a) => a.type !== "SEND_REPLY", "Use o campo “Resposta” da opção.");

export const botOptionSchema = z.object({
  label: z.string().trim().min(2, "Texto da opção: mínimo 2 caracteres.").max(60, "Texto da opção: no máximo 60 caracteres."),
  reply: z.string().trim().max(1000, "Resposta: no máximo 1000 caracteres.").default(""),
  actions: z.array(botActionSchema).max(4, "No máximo 4 ações por opção.").default([]),
  questions: z.array(z.object({ text: z.string().trim().min(3, "Pergunta: mínimo 3 caracteres.").max(300, "Pergunta: no máximo 300 caracteres."), fieldId: id.nullable() })).max(5, "No máximo 5 perguntas por opção.").default([]),
});
export type BotOption = z.infer<typeof botOptionSchema>;

export const botSchema = z.object({
  enabled: z.boolean(),
  greeting: z.string().trim().min(2, "Escreva a mensagem de boas-vindas.").max(600, "Boas-vindas: no máximo 600 caracteres."),
  invalidText: z.string().trim().min(2, "Escreva o aviso de opção inválida.").max(300),
  handoffText: z.string().trim().min(2, "Escreva a mensagem de encaminhamento.").max(600),
  options: z.array(botOptionSchema).min(1, "Crie pelo menos uma opção.").max(8, "No máximo 8 opções."),
});
export type BotInput = z.infer<typeof botSchema>;

export const BOT_HANDOFF_KEY = "0";

/** Texto do menu: saudação + opções numeradas + "0" para falar com atendente. */
export function menuText(greeting: string, options: { label: string }[]): string {
  return `${greeting.trim()}\n\n${options.map((o, i) => `${i + 1} - ${o.label}`).join("\n")}\n\n0 - Falar com um atendente`;
}

/** Modelo pronto para escritório de advocacia (o usuário revisa antes de salvar). */
export const BOT_TEMPLATE: Omit<BotInput, "options"> & { options: { label: string; reply: string; questions: string[] }[] } = {
  enabled: true,
  greeting: "Olá! Você falou com o escritório. Escolha uma opção digitando o número:",
  invalidText: "Não entendi. Responda só com o número de uma das opções.",
  handoffText: "Obrigado! Um atendente vai continuar a conversa com você em instantes.",
  options: [
    { label: "Já sou cliente e quero saber do meu processo", reply: "Certo! Vamos pedir para a equipe do seu processo falar com você.", questions: ["Qual o seu nome completo?"] },
    { label: "Quero contratar o escritório (novo caso)", reply: "Que bom que você nos procurou! Só algumas perguntas rápidas para agilizar seu atendimento.", questions: ["Qual o seu nome completo?", "Em poucas palavras, o que aconteceu e o que você precisa?"] },
    { label: "Financeiro / honorários", reply: "Certo! Vamos encaminhar para o financeiro.", questions: [] },
  ],
};
