import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { TabsNav } from "@/components/ui/tabs-nav";
import { formatDate } from "@/lib/dates/format";
import { formatPhone } from "@/lib/format/phone";
import { NotFoundError } from "@/lib/permissions/check";
import { formatDocument } from "@/lib/validation/br-documents";
import { uuidSchema } from "@/lib/validation/common";
import { CASE_STATUS_LABEL } from "@/modules/cases/schemas";
import { ArchiveClientButton } from "@/modules/clients/client-actions";
import { ContactsManager } from "@/modules/clients/contacts-manager";
import { CLIENT_STATUS_LABEL, CLIENT_TYPE_LABEL } from "@/modules/clients/schemas";
import { DocumentsPanel } from "@/modules/documents/documents-panel";
import { can } from "@/server/context";
import { listCasesForClient } from "@/server/services/case.service";
import { getClient } from "@/server/services/client.service";
import { PortalPanel } from "@/modules/portal/portal-panel";
import { listPortalAccess } from "@/server/services/portal.service";
import { listDocuments } from "@/server/services/document.service";
import { ConversationsCard } from "@/modules/whatsapp/conversations-card";
import { SendClientCard } from "@/modules/whatsapp/send-client-card";
import { clientMessageTarget } from "@/server/services/chat-send.service";
import { conversationsOfClient } from "@/server/services/chat-links.service";
import { VaultPanel } from "@/modules/vault/vault-panel";
import { listClientCredentials, VAULT_SYSTEMS } from "@/server/services/client-vault.service";
import { ClientPendingsPanel } from "@/modules/portal/plus-ui";
import { listPendingsForClient } from "@/server/services/portal-plus.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Cliente" };

const TONE = { ACTIVE: "success", PROSPECT: "info", INACTIVE: "neutral" } as const;

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{children || <span className="text-muted">—</span>}</dd>
    </div>
  );
}

export default async function ClientDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const { ctx, organization } = await requireTenant();
  if (!can(ctx, "clients:read")) return <AccessDenied />;
  const parsed = uuidSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const client = await getClient(ctx, parsed.data).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!client) notFound();

  const canCases = can(ctx, "cases:read");
  const canDocs = can(ctx, "documents:read");
  const tabs = [
    { key: "resumo", label: "Resumo" },
    { key: "contatos", label: "Contatos", count: client.contacts.length },
    ...(canCases ? [{ key: "processos", label: "Processos" }] : []),
    ...(canDocs ? [{ key: "documentos", label: "Documentos" }] : []),
    ...(can(ctx, "clients:write") && can(ctx, "members:invite") ? [{ key: "portal", label: "Portal" }] : []),
    ...(can(ctx, "vault:read") || can(ctx, "vault:manage") ? [{ key: "cofre", label: "Cofre" }] : []),
  ];
  const requested = (await searchParams).aba ?? "resumo";
  const tab = tabs.some((t) => t.key === requested) ? requested : "resumo";
  const tz = organization.timezone;

  const address = [client.addressStreet, client.addressNumber, client.addressComplement, client.addressDistrict, [client.addressCity, client.addressState].filter(Boolean).join("/"), client.addressZip]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={client.name}
        description={`${CLIENT_TYPE_LABEL[client.type]}${client.document ? ` · ${formatDocument(client.type, client.document)}` : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={TONE[client.status]}>{CLIENT_STATUS_LABEL[client.status]}</Badge>
            {can(ctx, "clients:write") ? (
              <Link href={`/clientes/${client.id}/editar`} className={buttonVariants({ variant: "secondary" })}>
                <Pencil className="h-4 w-4" aria-hidden /> Editar
              </Link>
            ) : null}
          </div>
        }
      />
      <TabsNav base={`/clientes/${client.id}`} current={tab} tabs={tabs} />

      {tab === "resumo" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Dados cadastrais" />
            <CardBody>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Item label={client.type === "PERSON" ? "Nome completo" : "Razão social"}>{client.name}</Item>
                <Item label={client.type === "PERSON" ? "Nome social" : "Nome fantasia"}>{client.tradeName}</Item>
                <Item label={client.type === "PERSON" ? "CPF" : "CNPJ"}>{client.document ? formatDocument(client.type, client.document) : null}</Item>
                {client.type === "PERSON" ? <Item label="Data de nascimento">{client.birthDate ? formatDate(client.birthDate, "UTC") : null}</Item> : null}
                <Item label="E-mail">{client.email}</Item>
                <Item label="Telefone">{client.phone ? formatPhone(client.phone) : null}</Item>
                <div className="sm:col-span-2">
                  <Item label="Endereço">{address}</Item>
                </div>
                <div className="sm:col-span-2">
                  <Item label="Observações internas">{client.notes ? <span className="whitespace-pre-wrap">{client.notes}</span> : null}</Item>
                </div>
              </dl>
            </CardBody>
          </Card>
          <div className="space-y-4">
            <SendClientCard targets={await clientMessageTarget(ctx, client.id, organization.name).then((t) => (t ? [t] : []))} source="client" />
            <ConversationsCard rows={await conversationsOfClient(ctx, client.id)} />
            <Card>
              <CardHeader title="Etiquetas" />
              <CardBody>
                {client.tags.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {client.tags.map((t) => (
                      <Badge key={t} tone="accent">
                        {t}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">Sem etiquetas.</p>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Registro" />
              <CardBody className="space-y-1 text-xs text-muted">
                <p>Cadastrado em {formatDate(client.createdAt, tz)}</p>
                <p>Atualizado em {formatDate(client.updatedAt, tz)}</p>
              </CardBody>
            </Card>
            {can(ctx, "clients:delete") ? <ArchiveClientButton clientId={client.id} /> : null}
          </div>
        </div>
      ) : null}

      {tab === "contatos" ? (
        <ContactsManager
          clientId={client.id}
          canWrite={can(ctx, "clients:write")}
          contacts={client.contacts.map((c) => ({ id: c.id, name: c.name, role: c.role, email: c.email, phone: c.phone, isPrimary: c.isPrimary, notes: c.notes }))}
        />
      ) : null}

      {tab === "processos" ? <ClientCases clientId={client.id} ctx={ctx} /> : null}

      {tab === "portal" ? await (async () => {
        const access = await listPortalAccess(ctx, client.id);
        const pend = await listPendingsForClient(ctx, client.id);
        return (
          <div className="space-y-6">
            <PortalPanel clientId={client.id} canManage accounts={access.accounts.map((a) => ({ id: a.id, name: a.name, email: a.email }))} invitations={access.invitations.map((i) => ({ id: i.id, email: i.email }))} />
            <div>
              <h2 className="mb-2 text-sm font-semibold">Pendências do cliente</h2>
              <ClientPendingsPanel clientId={client.id} canWrite={can(ctx, "clients:write")} rows={pend.map((x) => ({ id: x.id, title: x.title, description: x.description, status: x.status, dueDate: x.dueDate ? x.dueDate.toISOString().slice(0, 10) : null, clientNote: x.clientNote }))} />
              <p className="mt-3 text-sm"><Link className="underline" href={`/portal-equipe/${client.id}`}>Abrir as mensagens deste cliente pelo portal</Link></p>
            </div>
          </div>
        );
      })() : null}

      {tab === "cofre" ? await (async () => {
        const items = await listClientCredentials(ctx, client.id);
        return <VaultPanel clientId={client.id} systems={VAULT_SYSTEMS} canRead={can(ctx, "vault:read")} canManage={can(ctx, "vault:manage")} items={items.map((c) => ({ id: c.id, system: c.system, label: c.label, updatedAt: c.updatedAt.toISOString(), lastRevealedAt: c.lastRevealedAt?.toISOString() ?? null, lastRevealedBy: c.lastRevealedBy }))} />;
      })() : null}

      {tab === "documentos" ? (
        <DocumentsPanel
          owner={{ clientId: client.id }}
          canWrite={can(ctx, "documents:write")}
          timezone={tz}
          revalidate={`/clientes/${client.id}`}
          documents={(await listDocuments(ctx, { clientId: client.id })).map((d) => ({ id: d.id, name: d.name, sizeBytes: d.sizeBytes, createdAt: d.createdAt.toISOString(), currentVersion: d.currentVersion }))}
        />
      ) : null}
    </div>
  );
}

async function ClientCases({ clientId, ctx }: { clientId: string; ctx: Parameters<typeof listCasesForClient>[0] }) {
  const cases = await listCasesForClient(ctx, clientId);
  return (
    <Card>
      <CardHeader title="Processos do cliente" description="Processos sigilosos só aparecem para quem tem acesso a eles." />
      <CardBody>
        {cases.length === 0 ? (
          <p className="text-sm text-muted">Nenhum processo vinculado.</p>
        ) : (
          <ul className="divide-y divide-border">
            {cases.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <Link href={`/processos/${c.id}`} className="text-sm font-medium hover:underline">
                    {c.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {c.number ?? "Sem número"}
                    {c.area ? ` · ${c.area}` : ""}
                  </p>
                </div>
                <Badge tone={c.status === "ACTIVE" ? "success" : "neutral"}>{CASE_STATUS_LABEL[c.status]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
