import { z } from "zod";
import { isYmd } from "@/lib/dates/ymd";

export const stepSchema = z.object({
  title: z.string().trim().min(3, "Informe o título da tarefa (mín. 3 caracteres).").max(200),
  description: z.string().trim().max(2000).default(""),
  dueDays: z.number().int().min(-365, "Prazo mínimo: -365 dias.").max(365, "Prazo máximo: 365 dias."),
  countType: z.enum(["CALENDAR","BUSINESS"]).default("CALENDAR"),
  relativeTo: z.enum(["BASE","PREVIOUS_DUE","PREVIOUS_DONE"]).default("BASE"),
  waitForPrevious: z.boolean().default(false),
  assigneeMode: z.enum(["TRIGGER_USER","CASE_RESPONSIBLE","FIXED"]).default("TRIGGER_USER"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  assigneeId: z.union([z.string().uuid(), z.literal("")]).default(""),
  ask: z.string().trim().max(120).default(""),
});

export const packageSchema = z.object({
  name: z.string().trim().min(3, "Informe o nome (mín. 3 letras).").max(80),
  description: z.string().trim().max(500).default(""),
  active: z.boolean().default(true),
  steps: z.array(stepSchema).min(1, "Inclua ao menos uma tarefa.").max(20, "No máximo 20 tarefas por pacote."),
}).superRefine((v,ctx)=>{v.steps.forEach((s,i)=>{if(i===0&&(s.relativeTo!=="BASE"||s.waitForPrevious))ctx.addIssue({code:"custom",path:["steps",i,"relativeTo"],message:"A primeira tarefa usa a data base, sem dependência."});if(s.assigneeMode==="FIXED"&&!s.assigneeId)ctx.addIssue({code:"custom",path:["steps",i,"assigneeId"],message:"Escolha a pessoa responsável."});});});
export type PackageInput = z.input<typeof packageSchema>;

export const runSchema = z.object({
  caseId: z.union([z.string().uuid(), z.literal("")]).default(""),
  clientId: z.union([z.string().uuid(), z.literal("")]).default(""),
  baseDate: z.string().refine(isYmd, "Data inválida."),
  answers: z.record(z.string(), z.string().max(300)).default({}),
  boardId: z.union([z.string().uuid(), z.literal("")]).default(""),
  nonWorkingDates: z.array(z.string().refine(isYmd,"Data inválida.")).max(100).default([]),
  force: z.boolean().default(false),
});
export type RunInput = z.input<typeof runSchema>;

type SeedStep = { title: string; description?: string; dueDays: number; priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT"; ask?: string };
/** Modelos iniciais. O escritório edita à vontade (nada aqui é regra jurídica, só rotina sugerida). */
export const SEED_PACKAGES: { key: string; name: string; description: string; steps: SeedStep[] }[] = [
  {
    key: "contrato-novo", name: "Contrato novo", description: "Esteira administrativa depois de fechar um contrato com o cliente.",
    steps: [
      { title: "Cadastrar o cliente e abrir o caso", dueDays: 1, priority: "HIGH" },
      { title: "Coletar procuração e documentos pessoais", dueDays: 2 },
      { title: "Enviar o contrato de honorários para assinatura", dueDays: 2 },
      { title: "Lançar os honorários no financeiro", dueDays: 3, ask: "Valor e forma de pagamento combinados" },
      { title: "Organizar a pasta de documentos do caso", dueDays: 3 },
      { title: "Dar entrada na ação ou iniciar o procedimento", dueDays: 7, priority: "HIGH" },
    ],
  },
  {
    key: "encerramento-acordo", name: "Encerramento com acordo", description: "Fechamento do caso quando termina em acordo.",
    steps: [
      { title: "Conferir os termos do acordo homologado", dueDays: 1, priority: "HIGH" },
      { title: "Avisar o cliente do resultado e do que vem a seguir", dueDays: 2 },
      { title: "Acompanhar o cumprimento e o pagamento do acordo", dueDays: 15, ask: "Valor e data do pagamento do acordo" },
      { title: "Lançar honorários de êxito no financeiro", dueDays: 15 },
      { title: "Pedir a baixa e o arquivamento do processo", dueDays: 20 },
      { title: "Encerrar o caso no sistema", dueDays: 25 },
    ],
  },
  {
    key: "encerramento-condenacao", name: "Encerramento por condenação", description: "Fechamento do caso quando termina em condenação (a favor ou contra o cliente).",
    steps: [
      { title: "Analisar a decisão e o que foi decidido", dueDays: 1, priority: "URGENT" },
      { title: "Comunicar o cliente do resultado", dueDays: 1, priority: "HIGH" },
      { title: "Avaliar recurso e conferir o prazo", dueDays: 2, priority: "URGENT" },
      { title: "Calcular os valores da condenação", dueDays: 7, ask: "Valor da condenação" },
      { title: "Lançar honorários de êxito/sucumbência no financeiro", dueDays: 15 },
      { title: "Encerrar o caso no sistema", dueDays: 30 },
    ],
  },
];
