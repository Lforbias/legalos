import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ImportForm } from "@/modules/comercial/admin-forms";
import { requireComercial } from "@/server/comercial";

export const metadata: Metadata = { title: "LegalOS Comercial — importar" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const { cx } = await requireComercial();
  return (
    <div className="space-y-4">
      <PageHeader title="Importar lista de escritórios" description="Traga a lista dos 100 melhores (ou qualquer outra) por planilha. Quem já existe (mesmo CNPJ) é atualizado, sem duplicar." />
      {cx.role !== "GERENTE" ? <p className="text-sm text-muted">Só a gerência importa listas.</p> : (
        <Card><CardHeader title="Planilha" /><CardBody><ImportForm /></CardBody></Card>
      )}
      <Card><CardHeader title="De onde vêm os escritórios" /><CardBody className="space-y-2 text-sm">
        <p>Não existe uma lista pública pronta de “advogados de São Paulo” com ranking. O caminho é este: a equipe monta a lista (por exemplo, a partir de rankings publicados) e informa o CNPJ de cada escritório. O sistema busca o restante na base pública da Receita (telefone, e-mail, endereço e sócios) e coloca o ponto no mapa pelo OpenStreetMap.</p>
        <p>Sempre confira os dados antes de ligar: a base pública pode estar desatualizada, e telefones digitados pela equipe nunca são trocados por vazio.</p>
      </CardBody></Card>
    </div>
  );
}
