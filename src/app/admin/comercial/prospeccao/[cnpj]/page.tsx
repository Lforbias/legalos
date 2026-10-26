import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatform } from "@/server/platform";
import { getCommercialProspect } from "@/server/services/prospecting.service";
import { ProspectEditor } from "@/modules/prospecting/prospect-editor";
import { stageSchema } from "@/modules/prospecting/schema";
export const metadata = { title: "Cadastro de prospecção — LegalOS" };

export default async function ProspectPage({ params }: { params: Promise<{ cnpj: string }> }) {
  const { pc } = await requirePlatform();
  const { cnpj } = await params;
  if (!/^\d{14}$/.test(cnpj)) notFound();
  const p = await getCommercialProspect(pc, cnpj);
  if (!p) notFound();
  const size = ({ '00': 'Não informado', '01': 'Microempresa', '03': 'Empresa de pequeno porte', '05': 'Demais' } as Record<string,string>)[p.companySize] ?? 'Não informado';
  const opened = /^\d{8}$/.test(p.openedOn) && p.openedOn !== '00000000' ? `${p.openedOn.slice(6,8)}/${p.openedOn.slice(4,6)}/${p.openedOn.slice(0,4)}` : 'Não informada';
  return <div className="space-y-6">
    <Link href="/admin/comercial/prospeccao" className="text-sm text-muted hover:underline">← Voltar ao mapa e cadastros</Link>
    <header><p className="text-xs uppercase tracking-widest text-muted">Origem: Receita Federal · competência {p.sourceMonth}</p><h1 className="mt-3 max-w-4xl text-3xl font-semibold tracking-tight">{p.legalName}</h1><p className="mt-2 text-sm text-muted">CNPJ {p.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')} · São Paulo / SP</p></header>
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section className="space-y-6 rounded-2xl border border-border bg-surface p-6"><h2 className="text-lg font-semibold">Informações do estabelecimento</h2><dl className="grid gap-5 sm:grid-cols-2">{[
        ['Nome fantasia', p.tradeName], ['Natureza jurídica', p.legalNature], ['Porte', size], ['Abertura', opened], ['CNAE de seleção', '6911-7/01 · Principal ou secundário'], ['Situação na base', 'Ativa'], ['Endereço', p.address], ['Bairro', p.neighborhood], ['CEP', p.postalCode], ['Telefone cadastrado', p.phone], ['E-mail cadastrado', p.email], ['Localização', p.latitude === null ? 'Ainda não localizada' : `${p.latitude}, ${p.longitude} · ${p.locationAccuracy === 'POSTAL_CODE' ? 'Aproximada por CEP' : 'Endereço conferido'}`],
      ].map(([label, value])=><div key={label} className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 break-words text-sm">{value || 'Não informado'}</dd></div>)}</dl><div className="border-t border-border pt-4 text-xs leading-relaxed text-muted">Contato {p.contactVerified ? 'conferido pela equipe' : 'não verificado'}. Dados cadastrais podem estar desatualizados ou apontar para a contabilidade. {p.doNotContact && <strong className="text-fg">Este escritório está marcado para não contatar.</strong>}</div></section>
      <ProspectEditor initial={{ cnpj: p.cnpj, version: p.version, stage: stageSchema.parse(p.stage), doNotContact: p.doNotContact, contactVerified: p.contactVerified, notes: p.notes, nextContactOn: p.nextContactOn, latitude: p.latitude, longitude: p.longitude, locationAccuracy: p.locationAccuracy === 'ADDRESS' || p.locationAccuracy === 'POSTAL_CODE' ? p.locationAccuracy : null }} />
    </div>
  </div>;
}
