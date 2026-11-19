import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "LegalOS — gestão jurídica por departamentos", template: "%s · LegalOS" },
  description: "Jurídico, Atendimento, Comercial, Financeiro e Gestão num só sistema para escritórios de advocacia, com a Minha Mesa de cada pessoa, o Cowork da equipe e a RUTE.",
  robots: { index: true, follow: true },
  openGraph: { title: "LegalOS — gestão jurídica por departamentos", description: "Cada área do escritório no seu lugar, todas conversando: processos, prazos, atendimento, CRM, financeiro e equipe.", type: "website", locale: "pt_BR" },
};

export default function ProdutoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
