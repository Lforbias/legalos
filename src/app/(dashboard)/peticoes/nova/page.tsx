import type { Metadata } from "next";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { buttonVariants as bv } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/form";
import { PetitionForm } from "@/modules/petitions/petition-form";
import { can } from "@/server/context";
import { assertCaseVisible, listCaseOptions } from "@/server/services/case.service";
import { listDocuments } from "@/server/services/document.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Nova petição" };

export default async function NewPetitionPage({ searchParams }: { searchParams: Promise<{ processo?: string }> }) {
  const { ctx } = await requireTenant();
  if (!can(ctx, "petitions:write") || !can(ctx, "cases:read") || !can(ctx, "documents:read")) return <AccessDenied />;
  const sp = await searchParams;
  const cases = await listCaseOptions(ctx);
  const selected = cases.find((c) => c.id === sp.processo);

  if (!selected) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Nova petição" description="Primeiro, escolha o processo. Depois você seleciona o documento anexado a ele." />
        <form method="get">
          <Card>
            <CardBody className="space-y-4">
              <Field label="Processo" htmlFor="processo">
                <Select id="processo" name="processo" defaultValue="" required>
                  <option value="">Escolha o processo…</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>{c.title}{c.number ? ` — ${c.number}` : ""}</option>
                  ))}
                </Select>
              </Field>
              <button type="submit" className={bv({})}>Continuar</button>
            </CardBody>
          </Card>
        </form>
      </div>
    );
  }

  await assertCaseVisible(ctx, selected.id);
  const documents = await listDocuments(ctx, { caseId: selected.id });
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Nova petição" description={`Processo: ${selected.title}`} />
      {documents.length === 0 ? (
        <Alert tone="warning">Este processo ainda não tem documentos. Anexe o arquivo da petição na aba Documentos do processo (ou gere um a partir de um modelo) e volte aqui.</Alert>
      ) : (
        <PetitionForm initial={{ caseId: selected.id, documentId: "", title: "", kind: "", court: "" }} documents={documents.map((d) => ({ id: d.id, name: d.name, currentVersion: d.currentVersion }))} />
      )}
    </div>
  );
}
