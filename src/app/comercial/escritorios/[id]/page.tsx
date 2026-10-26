import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ACTIVITY_LABEL, type StageKey } from "@/lib/comercial/stages";
import { brl2, dateBR, dateTimeBR } from "@/lib/comercial/format";
import { ActivityForm, ContactForm, RemoveContact } from "@/modules/comercial/activity-panel";
import { ProposalBuilder } from "@/modules/comercial/proposal-builder";
import { DeleteProspect, ProposalStatusButtons } from "@/modules/comercial/proposal-status";
import { ProspectForm } from "@/modules/comercial/prospect-form";
import { StageSelect } from "@/modules/comercial/stage-select";
import { requireComercial } from "@/server/comercial";
import { getProspect, listCatalog, ownersForSelect } from "@/server/services/comercial.service";

export const metadata: Metadata = { title: "LegalOS Comercial — escritório" };
export const dynamic = "force-dynamic";

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { cx } = await requireComercial();
  const [p, owners, catalog] = await Promise.all([getProspect(cx, id), ownersForSelect(cx), listCatalog()]);
  const who = new Map(owners.map((o) => [o.id, o.name]));
  const osm = p.lat != null && p.lng != null ? `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}` : null;
  return (
    <div className="space-y-4">
      <PageHeader
        title={p.name}
        description={[p.cnpj ? `CNPJ ${p.cnpj}` : null, p.district, p.rankingPosition ? `#${p.rankingPosition} na lista${p.rankingSource ? ` (${p.rankingSource})` : ""}` : null].filter(Boolean).join(" · ")}
        actions={<Link href="/comercial/escritorios" className="text-sm underline">Voltar à lista</Link>}
      />
      {p.doNotContact ? <Alert tone="warning">Marcado como <strong>não contatar</strong>. Não ligue nem envie mensagem; registre só anotações.</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardHeader title="Cadastro" description="Tudo pode ser editado. Os dados da Receita só preenchem; confira antes de ligar." /><CardBody>
          <ProspectForm owners={owners} plans={catalog.plans.map((x) => ({ key: x.key, name: x.name }))} p={{ id: p.id, name: p.name, cnpj: p.cnpj, legalName: p.legalName, phone: p.phone, phone2: p.phone2, whatsapp: p.whatsapp, email: p.email, website: p.website, street: p.street, number: p.number, complement: p.complement, district: p.district, city: p.city, state: p.state, zip: p.zip, lawyersEstimate: p.lawyersEstimate, areas: p.areas, tags: p.tags, rankingPosition: p.rankingPosition, rankingSource: p.rankingSource, ownerId: p.ownerId, planKey: p.planKey, expectedUsers: p.expectedUsers, expectedMonthlyCents: p.expectedMonthlyCents, probabilityPct: p.probabilityPct, expectedCloseAt: p.expectedCloseAt, nextActionAt: p.nextActionAt, nextActionNote: p.nextActionNote, notes: p.notes, doNotContact: p.doNotContact, contactVerified: p.contactVerified }} />
        </CardBody></Card>
        <div className="space-y-4">
          <Card><CardHeader title="Etapa do funil" /><CardBody className="space-y-2">
            <StageSelect id={p.id} stage={p.stage as StageKey} expectedCents={p.expectedMonthlyCents} />
            {p.stage === "GANHO" ? <p className="text-sm">Fechado em {dateBR(p.wonAt)} por {brl2(p.wonMonthlyCents)}/mês.</p> : null}
            {p.stage === "PERDIDO" ? <p className="text-sm text-muted">Motivo: {p.lostReason ?? "—"}</p> : null}
            <p className="text-xs text-muted">Responsável: {p.ownerId ? who.get(p.ownerId) ?? "—" : "ninguém"}</p>
          </CardBody></Card>
          <Card><CardHeader title="Localização" /><CardBody className="space-y-1 text-sm">
            {osm ? <p><a className="underline" href={osm} target="_blank" rel="noreferrer noopener">Ver no OpenStreetMap</a> · <Link className="underline" href="/comercial/mapa">Mapa geral</Link></p> : <p className="text-muted">{p.geocodeNote ?? "Ainda sem ponto no mapa. Preencha rua, número e CEP e use “Refazer ponto no mapa”."}</p>}
            {p.geocodeNote && osm ? <p className="text-xs text-muted">{p.geocodeNote}</p> : null}
          </CardBody></Card>
          <Card><CardHeader title="Dados da Receita" description={p.enrichedAt ? `Atualizado em ${dateBR(p.enrichedAt)}` : "Ainda não consultado"} /><CardBody className="space-y-1 text-sm">
            <p><span className="text-muted">Atividade:</span> {p.cnae ?? "—"}</p>
            <p><span className="text-muted">Abertura:</span> {dateBR(p.openedAt)} · <span className="text-muted">Porte:</span> {p.companySize ?? "—"}</p>
          </CardBody></Card>
          <Card><CardHeader title="Contatos" /><CardBody className="space-y-3">
            {p.contacts.length === 0 ? <p className="text-sm text-muted">Nenhum contato ainda.</p> : null}
            {p.contacts.map((c) => (
              <div key={c.id} className="flex items-start justify-between gap-2 text-sm">
                <div><p className="font-medium">{c.name} {c.isDecisionMaker ? <Badge tone="success">decide</Badge> : null}</p><p className="text-xs text-muted">{[c.role, c.phone, c.email].filter(Boolean).join(" · ")}</p></div>
                <RemoveContact prospectId={p.id} contactId={c.id} />
              </div>
            ))}
            <ContactForm prospectId={p.id} />
          </CardBody></Card>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="Registrar contato" description="Ligação, WhatsApp, e-mail, reunião ou demonstração. Marque o próximo retorno para não perder o fio." /><CardBody>
          <ActivityForm prospectId={p.id} />
        </CardBody></Card>
        <Card><CardHeader title="Histórico" /><CardBody>
          {p.activities.length === 0 ? <p className="text-sm text-muted">Nada registrado ainda.</p> : (
            <ol className="space-y-3">{p.activities.map((a) => (
              <li key={a.id} className="border-l-2 border-border pl-3 text-sm">
                <p className="text-xs text-muted">{dateTimeBR(a.createdAt)} · {ACTIVITY_LABEL[a.kind]}{a.userId ? ` · ${who.get(a.userId) ?? ""}` : ""}</p>
                <p>{a.summary}</p>
                {a.outcome ? <p className="text-xs text-muted">Resultado: {a.outcome}</p> : null}
                {a.nextActionAt ? <p className="text-xs text-muted">Retorno marcado: {dateTimeBR(a.nextActionAt)}</p> : null}
              </li>
            ))}</ol>
          )}
        </CardBody></Card>
      </div>
      <Card><CardHeader title="Proposta e preço" description="Monte o valor com plano e aditivos. Ao salvar, o valor mensal previsto do escritório é atualizado." /><CardBody className="space-y-4">
        <ProposalBuilder prospectId={p.id} plans={catalog.plans} addons={catalog.addons.filter((a) => a.active)} defaults={{ planKey: p.planKey, users: p.expectedUsers, addonKeys: p.addonKeys }} />
        {p.proposals.length ? (
          <div className="space-y-2 border-t border-border pt-3">
            <h3 className="text-sm font-medium">Propostas anteriores</h3>
            {p.proposals.map((x) => (
              <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
                <span>{dateBR(x.createdAt)} · {brl2(x.monthlyCents)}/mês · {x.users} usuários · <Badge tone={x.status === "ACEITA" ? "success" : x.status === "RECUSADA" ? "danger" : "neutral"}>{x.status.toLowerCase()}</Badge></span>
                <ProposalStatusButtons prospectId={p.id} proposalId={x.id} status={x.status} />
              </div>
            ))}
          </div>
        ) : null}
      </CardBody></Card>
      {cx.role === "GERENTE" ? <DeleteProspect id={p.id} /> : null}
    </div>
  );
}
