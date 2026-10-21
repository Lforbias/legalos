/**
 * Camada de peticionamento. Cada tribunal/sistema (PJe, e-SAJ, eproc, Projudi...) exige certificado digital e
 * credenciais do advogado e deve ser implementado como um adaptador próprio. NESTA versão existe apenas o
 * adaptador de DEMONSTRAÇÃO: ele NÃO se comunica com nenhum tribunal e NÃO gera protocolo válido.
 */
export type PetitionSubmission = {
  petitionId: string;
  caseNumber: string | null;
  court: string | null;
  title: string;
  document: { fileName: string; mimeType: string; sizeBytes: number; sha256: string };
  /** Anexos na ordem de envio, com a classificação escolhida (o adaptador real traduz para os tipos do tribunal). */
  attachments: { fileName: string; mimeType: string; sizeBytes: number; sha256: string; classification: string }[];
};

export type PetitionReceipt = { protocol: string; receipt: string };

/** O envio chegou (ou pode ter chegado) ao tribunal, mas a resposta não foi recebida: NÃO reenviar sem conferir no tribunal. */
export class SubmissionUncertainError extends Error {}

/** Contexto extra para adaptadores reais (bytes dos arquivos e quem envia). O adaptador de demonstração ignora. */
export type SubmitEnv = { ctx: unknown; caseId: string; files: { main: Buffer; attachments: Buffer[] }; post?: unknown };

export interface PetitioningAdapter {
  key: string;
  label: string;
  /** true = não protocola de verdade. A interface exibe aviso permanente e o registro é marcado como demonstração. */
  isDemo: boolean;
  /** Verificações ANTES de reservar o envio (erro claro ao usuário, sem marcar a petição como falha). */
  preflight?(input: PetitionSubmission, env: Omit<SubmitEnv, "files">): Promise<void>;
  submit(input: PetitionSubmission, env?: SubmitEnv): Promise<PetitionReceipt>;
}

export const demoAdapter: PetitioningAdapter = {
  key: "demo",
  label: "Demonstração (sem protocolo real)",
  isDemo: true,
  async submit(input) {
    const now = new Date();
    const stamp = now.toISOString().slice(0, 10).replaceAll("-", "");
    const protocol = `DEMO-${stamp}-${input.document.sha256.slice(0, 8).toUpperCase()}`;
    const receipt = [
      "RECIBO DE DEMONSTRAÇÃO — NENHUM PROTOCOLO REAL FOI REALIZADO",
      `Petição: ${input.title}`,
      `Processo: ${input.caseNumber ?? "sem número"}${input.court ? ` · ${input.court}` : ""}`,
      `Arquivo: ${input.document.fileName} (${input.document.sizeBytes} bytes)`,
      `SHA-256: ${input.document.sha256}`,
      ...(input.attachments.length ? [`Anexos (${input.attachments.length}):`, ...input.attachments.map((a, i) => `  ${i + 1}. [${a.classification}] ${a.fileName} (${a.sizeBytes} bytes)`)] : []),
      `Simulado em: ${now.toISOString()}`,
      "Para protocolar de fato, envie a petição diretamente no sistema do tribunal.",
    ].join("\n");
    return { protocol, receipt };
  },
};

/** Adaptadores reais são registrados por quem os implementa (camada de servidor), para esta camada não depender do banco. */
const ADAPTERS: Record<string, PetitioningAdapter> = { [demoAdapter.key]: demoAdapter };

export function registerPetitioningAdapter(a: PetitioningAdapter) {
  ADAPTERS[a.key] = a;
}

export function getPetitioningAdapter(key = process.env.PETITIONING_ADAPTER ?? "demo"): PetitioningAdapter {
  const a = ADAPTERS[key];
  if (!a) throw new Error(`Adaptador de peticionamento desconhecido: ${key}`);
  return a;
}
