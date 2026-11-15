import { z } from "zod";
import { db } from "@/lib/db/client";
import { isYmd, ymdToDate } from "@/lib/dates/ymd";
import { ConflictError } from "@/lib/permissions/check";
import { decryptSecret, mfaKey } from "@/lib/security/totp";
import { formatCnj, isValidCnj } from "@/lib/validation/br-documents";
import { assertCan, type TenantContext } from "@/server/context";
import { canImportLegalMail } from "@/server/legalmail-access";
import { audit } from "./audit.service";
import { assertCaseVisible } from "./case.service";

const MAX_PAGES = 80;
const PAGE_SIZE = 50;
const MAX_MOVEMENTS = 50;

const lawsuitSchema = z.object({
  idprocessos: z.number().int().positive(),
  numero_processo: z.string(),
  nome_classe: z.string().nullish(),
});
const movementSchema = z.object({
  idmovimentacoes: z.number().int().positive(),
  fk_processo: z.number().int().positive(),
  data_movimentacao: z.string().refine(isYmd),
  tipo: z.literal("movimentacao"),
  titulo: z.string(),
  texto: z.string().nullish(),
});

async function getLegalMailList(path: "all" | "case-files", key: string, params: Record<string, string>, signal: AbortSignal, fetcher: typeof fetch) {
  const url = new URL(`https://api.legalmail.com.br/api/v1/lawsuit/${path}`);
  url.search = new URLSearchParams({ ...params, api_key: key }).toString();
  const response = await fetcher(url, { cache: "no-store", redirect: "error", signal }).catch(() => null);
  if (!response) throw new ConflictError("O LegalMail não respondeu a tempo. Tente novamente mais tarde.");
  if (response.status === 402) throw new ConflictError("O LegalMail informou saldo insuficiente para a consulta.");
  if (response.status === 429) throw new ConflictError("O LegalMail limitou as consultas. Tente novamente mais tarde.");
  if (!response.ok) throw new ConflictError("O LegalMail recusou a consulta. Confira a chave e o acesso do escritório.");
  const body: unknown = await response.json().catch(() => null);
  if (!Array.isArray(body)) throw new ConflictError("O LegalMail retornou um formato inesperado.");
  return body as unknown[];
}

export async function syncLegalMailHistory(ctx: TenantContext, caseId: string, fetcher: typeof fetch = fetch, selectedId?: number) {
  assertCan(ctx, "cases:write");
  if (!(await canImportLegalMail(ctx))) throw new ConflictError("A captura judicial pelo LegalMail foi removida do LegalOS.");
  const local = await assertCaseVisible(ctx, caseId);
  const cnj = local.number && isValidCnj(local.number) ? formatCnj(local.number) : null;
  if (!cnj) throw new ConflictError("Cadastre um número CNJ válido neste processo.");

  const [config] = await db.$queryRaw<{ api_key_enc: string | null }[]>`
    SELECT api_key_enc FROM legalmail_pilot WHERE singleton AND organization_id = ${ctx.organizationId}::uuid
  `;
  const vault = mfaKey();
  if (!config?.api_key_enc || !vault) throw new ConflictError("Salve uma chave de API do LegalMail em Integrações.");
  let key: string;
  try {
    key = decryptSecret(config.api_key_enc, vault);
  } catch {
    throw new ConflictError("Não foi possível abrir a chave do LegalMail. Salve a chave novamente em Integrações.");
  }

  const signal = AbortSignal.timeout(30000);
  const matched = new Map<number, string | null>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const results = await getLegalMailList("all", key, {
      offset: String(page * PAGE_SIZE), limit: String(PAGE_SIZE),
    }, signal, fetcher);
    const parsed = z.array(lawsuitSchema).safeParse(results);
    if (!parsed.success) throw new ConflictError("O LegalMail retornou uma lista de processos inválida.");
    for (const entry of parsed.data) {
      if (isValidCnj(entry.numero_processo) && formatCnj(entry.numero_processo) === cnj) matched.set(entry.idprocessos, entry.nome_classe ?? null);
    }
    if (selectedId !== undefined && matched.has(selectedId)) break;
    if (results.length < PAGE_SIZE) break;
    if (page === MAX_PAGES - 1) throw new ConflictError("Não foi possível verificar todo o acervo do LegalMail nesta consulta.");
  }
  async function readMovements(processId: number) {
    const raw = await getLegalMailList("case-files", key, { idprocessos: String(processId) }, signal, fetcher);
    return raw
      .map((item) => movementSchema.safeParse(item))
      .flatMap((item) => item.success && item.data.fk_processo === processId ? [item.data] : [])
      .sort((a, b) => b.data_movimentacao.localeCompare(a.data_movimentacao) || b.idmovimentacoes - a.idmovimentacoes);
  }

  if (selectedId !== undefined && !matched.has(selectedId)) {
    throw new ConflictError("O cadastro escolhido não corresponde ao CNJ deste processo.");
  }
  if (selectedId === undefined && matched.size > 1) {
    const candidates = await Promise.all([...matched].slice(0, 10).map(async ([id, className]) => {
      const movements = await readMovements(id).catch(() => null);
      return { id, className, total: movements?.length ?? null, latest: movements?.[0]?.data_movimentacao ?? null };
    }));
    return { found: true, total: 0, imported: 0, candidates };
  }
  const processId = selectedId ?? matched.keys().next().value;
  if (processId === undefined) return { found: false, total: 0, imported: 0 };
  const movements = (await readMovements(processId)).slice(0, MAX_MOVEMENTS);

  return db.$transaction(async (tx) => {
    const current = await assertCaseVisible(ctx, caseId, tx);
    if (current.number !== local.number) throw new ConflictError("O número do processo mudou durante a consulta. Tente novamente.");
    const { count: imported } = await tx.caseEvent.createMany({
      data: movements.map((entry) => ({
        organizationId: ctx.organizationId,
        caseId,
        source: "IMPORTED" as const,
        kind: "LEGALMAIL_MOVEMENT",
        title: entry.titulo.trim().slice(0, 200) || "Movimentação",
        description: entry.texto?.trim().slice(0, 20000) || null,
        occurredAt: ymdToDate(entry.data_movimentacao),
        externalKey: `legalmail:${entry.idmovimentacoes}`,
      })),
      skipDuplicates: true,
    });
    await audit({ action: "legalmail.history_synced", organizationId: ctx.organizationId, userId: ctx.userId, resourceType: "case", resourceId: caseId, metadata: { imported, total: movements.length }, meta: ctx.meta }, tx);
    return { found: true, total: movements.length, imported };
  });
}
