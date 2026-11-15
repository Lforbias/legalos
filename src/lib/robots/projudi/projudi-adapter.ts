/**
 * Adaptador PROJUDI — tribunais que usam PROJUDI com MNI 2.2.2.
 *
 * Tribunais incluídos: TJPR.
 * O PROJUDI é sistema próprio de cada tribunal; o único canal interoperável
 * é o MNI, quando o tribunal o habilita. O adaptador usa o transporte MNI existente.
 *
 * Nenhum tribunal homologado — integrationStatus começa em ADAPTER_WIP.
 */

import type {
  TribunalAdapter,
  AdapterDescriptor,
  AdapterContext,
  AdapterOutcome,
  CourtTarget,
} from "@/lib/judicial/adapter";
import type { EvidenceEnvironment } from "@/lib/judicial/contracts";

const PROJUDI_TARGETS: readonly CourtTarget[] = [
  { courtCode: "TJPR", degree: "1", label: "TJPR — 1º grau (PROJUDI via MNI)" },
  { courtCode: "TJPR", degree: "2", label: "TJPR — 2º grau (PROJUDI via MNI)" },
];

const MNI_ENDPOINTS: Record<string, string | null> = {
  "TJPR-1": null,
  "TJPR-2": null,
};

const descriptor: AdapterDescriptor = {
  key: "projudi-mni",
  engineFamily: "PROJUDI",
  label: "PROJUDI — via MNI 2.2.2",
  supportedAuthModes: ["PASSWORD"],
  capabilities: {
    validateCredentials: true,
    listNotices: false,
    getCase: false,
  },
  supportedTargets: PROJUDI_TARGETS,
};

function endpointKey(target: CourtTarget): string {
  return `${target.courtCode}-${target.degree}`;
}

async function validateCredentials(
  ctx: AdapterContext,
): Promise<AdapterOutcome<{ evidenceEnvironment: EvidenceEnvironment }>> {
  const key = endpointKey(ctx.target);
  const endpoint = MNI_ENDPOINTS[key];

  if (!endpoint) {
    return {
      ok: false,
      code: "INTERNAL",
      message: `O endpoint MNI do ${ctx.target.courtCode} (${ctx.target.degree}º grau) ainda não foi registrado. O tribunal precisa confirmar a URL do serviço MNI.`,
      retryable: false,
    };
  }

  const secret = await ctx.openSecret();
  if (!secret.document || !secret.password) {
    return {
      ok: false,
      code: "BAD_CREDENTIALS",
      message: "CPF/CNPJ ou senha não encontrados no cofre.",
      retryable: false,
    };
  }

  try {
    const { buildConsultarAvisosPendentes, parseAvisosPendentes } = await import("@/lib/mni/xml");
    const { postSoap } = await import("@/lib/mni/transport");
    const xml = buildConsultarAvisosPendentes({ document: secret.document, password: secret.password });
    const response = await postSoap(endpoint, xml);
    parseAvisosPendentes(response);

    return {
      ok: true,
      data: { evidenceEnvironment: "PRODUCTION" as EvidenceEnvironment },
      message: `Conectado ao ${ctx.target.courtCode} via MNI.`,
    };
  } catch (err: unknown) {
    const { MniError } = await import("@/lib/mni/xml");
    const message = err instanceof Error ? err.message : "Erro de rede ao conectar ao tribunal.";
    if (err instanceof MniError) {
      if (message.toLowerCase().includes("senha") || message.toLowerCase().includes("inválid")) {
        return { ok: false, code: "BAD_CREDENTIALS", message, retryable: false };
      }
      if (message.toLowerCase().includes("bloqueado") || message.toLowerCase().includes("bloqueio")) {
        return { ok: false, code: "ACCOUNT_BLOCKED", message, retryable: false };
      }
      return { ok: false, code: "INTERNAL", message, retryable: false };
    }
    if (message.includes("ECONNREFUSED") || message.includes("ETIMEDOUT") || message.includes("timeout") || message.includes("demorou")) {
      return { ok: false, code: "TIMEOUT", message, retryable: true };
    }
    return { ok: false, code: "NETWORK", message, retryable: true };
  }
}

export const projudiAdapter: TribunalAdapter = {
  descriptor,
  validateCredentials,
};
