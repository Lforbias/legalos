/**
 * Adaptador eproc — tribunais que usam eproc com MNI 2.2.2.
 *
 * Tribunais incluídos: TRF2, TRF4, TJAC, TJRS, TJSC.
 * O adaptador usa o transporte MNI existente (src/lib/mni/) para validar
 * credenciais via consultarAvisosPendentes. Nenhum deles está homologado:
 * o integrationStatus começa em ADAPTER_WIP.
 *
 * O endpoint MNI real de cada tribunal precisa ser registrado antes de usar.
 * Enquanto não houver endpoint, validateCredentials retorna INTERNAL.
 */

import type {
  TribunalAdapter,
  AdapterDescriptor,
  AdapterContext,
  AdapterOutcome,
  CourtTarget,
} from "@/lib/judicial/adapter";
import type { EvidenceEnvironment } from "@/lib/judicial/contracts";

const EPROC_TARGETS: readonly CourtTarget[] = [
  { courtCode: "TRF2", degree: "1", label: "TRF2 — 1º grau (eproc)" },
  { courtCode: "TRF2", degree: "2", label: "TRF2 — 2º grau (eproc)" },
  { courtCode: "TRF4", degree: "1", label: "TRF4 — 1º grau (eproc)" },
  { courtCode: "TRF4", degree: "2", label: "TRF4 — 2º grau (eproc)" },
  { courtCode: "TJAC", degree: "1", label: "TJAC — 1º grau (eproc)" },
  { courtCode: "TJAC", degree: "2", label: "TJAC — 2º grau (eproc)" },
  { courtCode: "TJRS", degree: "1", label: "TJRS — 1º grau (eproc)" },
  { courtCode: "TJRS", degree: "2", label: "TJRS — 2º grau (eproc)" },
  { courtCode: "TJSC", degree: "1", label: "TJSC — 1º grau (eproc)" },
  { courtCode: "TJSC", degree: "2", label: "TJSC — 2º grau (eproc)" },
];

/**
 * Mapa de endpoints MNI por tribunal+grau.
 * Cada entrada será preenchida quando o tribunal confirmar a URL do serviço.
 * Enquanto null, o adaptador recusa a validação com INTERNAL.
 */
const MNI_ENDPOINTS: Record<string, string | null> = {
  "TRF2-1": null,
  "TRF2-2": null,
  "TRF4-1": null,
  "TRF4-2": null,
  "TJAC-1": null,
  "TJAC-2": null,
  "TJRS-1": null,
  "TJRS-2": null,
  "TJSC-1": null,
  "TJSC-2": null,
};

const descriptor: AdapterDescriptor = {
  key: "eproc-mni",
  engineFamily: "EPROC",
  label: "eproc — via MNI 2.2.2",
  supportedAuthModes: ["PASSWORD"],
  capabilities: {
    validateCredentials: true,
    listNotices: false,
    getCase: false,
  },
  supportedTargets: EPROC_TARGETS,
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

export const eprocAdapter: TribunalAdapter = {
  descriptor,
  validateCredentials,
};
