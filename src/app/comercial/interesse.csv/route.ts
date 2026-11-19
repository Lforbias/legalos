import { NextResponse } from "next/server";
import { toCsv } from "@/lib/reports/csv";
import { requireComercial } from "@/server/comercial";
import { audit } from "@/server/services/audit.service";
import { interestRows } from "@/server/services/launch-interest.service";

export const dynamic = "force-dynamic";

/** Planilha (CSV) da lista de interesse da landing de lançamento. Só para a equipe comercial da plataforma; auditada. */
export async function GET() {
  const { cx } = await requireComercial();
  const rows = await interestRows();
  await audit({ action: "comercial.interest_export", userId: cx.userId, resourceType: "com_prospect", meta: { ...cx.meta } });
  const csv = toCsv(["Cadastro em", "Nome", "Escritório", "E-mail", "WhatsApp", "Etapa", "Não contatar"], rows);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="lista-de-interesse-${stamp}.csv"`, "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
