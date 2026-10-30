import { NextResponse } from "next/server";
import { boxV3PreviewEnabled } from "@/lib/box-v3-preview";
import { CONNECTORS, coverageMatrix } from "@/lib/box-v3/core";
import { loadEvidence } from "@/server/judicial/evidence.service";
import { getTenant } from "@/server/session";

export const dynamic = "force-dynamic";

/**
 * Box 3.0 — matriz de capacidades × cobertura (§17, §22). Cruza o que cada conector DECLARA no código
 * (`CONNECTORS`) com a evidência REAL mais recente gravada pelo orquestrador (`coverageMatrix`). Nunca afirma
 * cobertura nacional nem "conectado" só por existir um registro salvo — apenas o que a evidência prova, por
 * tribunal e por operação. Disponível só enquanto a prévia do Box 3.0 estiver habilitada.
 */
export async function GET() {
  if (!boxV3PreviewEnabled()) return NextResponse.json({ error: { code: "not_found", message: "Prévia do Box 3.0 indisponível." } }, { status: 404 });
  const tenant = await getTenant();
  if (!tenant) return NextResponse.json({ error: { code: "unauthorized", message: "Sessão inválida ou expirada." } }, { status: 401 });
  // Permissão bruta do cargo, não `can()`: `can()` zera qualquer `inbox:*` enquanto BOX_AVAILABLE for
  // falso (retirada do Box autenticado), mas esta rota expõe capacidades do Box 3.0 (conectores públicos
  // como DJEN/DataJud inclusive), que são independentes dela — mesmo padrão de src/server/judicial/box-v3.service.ts.
  if (!tenant.ctx.permissions.has("inbox:read")) return NextResponse.json({ error: { code: "forbidden", message: "Sem acesso ao Box." } }, { status: 403 });

  const now = new Date();
  const evidence = await loadEvidence(tenant.ctx.organizationId);
  const coverage = coverageMatrix(evidence, now);
  const connectors = CONNECTORS.map((c) => ({
    key: c.key,
    label: c.label,
    family: c.family,
    accessMethod: c.accessMethod,
    requiresAuthorization: c.requiresAuthorization,
    capabilities: Object.fromEntries(Object.entries(c.capabilities).map(([op, status]) => [op, { implemented: status.implemented, note: status.note ?? null }])),
    limitations: c.limitations,
  }));

  return NextResponse.json({ connectors, coverage, checkedAt: now.toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
