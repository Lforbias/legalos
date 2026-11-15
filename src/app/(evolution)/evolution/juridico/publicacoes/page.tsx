import Link from "next/link";
import { Newspaper, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DepartmentHeader } from "@/components/evolution/department-header";
import { EmptyState } from "@/components/evolution/empty-state";
import { DEPARTMENTS } from "@/config/evolution-navigation";
import { formatDate, formatDateTime } from "@/lib/dates/format";
import { NOTICE_KIND_LABEL } from "@/modules/inbox/schemas";
import { PublicNoticeLink } from "@/modules/judicial/public-notice-link";
import { can } from "@/server/context";
import { listCases } from "@/server/services/case.service";
import { listPublicDjenNotices } from "@/server/services/public-judicial.service";
import { requireTenant } from "@/server/session";

export default async function PublicacoesPage() {
  const { ctx } = await requireTenant();
  const dept = DEPARTMENTS.juridico;
  if (!can(ctx, "cases:read")) {
    return <><DepartmentHeader icon={dept.icon} color={dept.color} title="Publicações e movimentações" description="Acompanhe as publicações públicas vinculadas aos processos do escritório." /><EmptyState icon={Newspaper} title="Sem acesso ao Jurídico" description="Seu perfil não tem permissão para acessar os processos e publicações." /></>;
  }

  const { total, items } = await listPublicDjenNotices(ctx);
  const cases = can(ctx, "cases:write") ? await listCases(ctx, { board: true, acervo: "all" }).then((result) => result.items.map((item) => ({ id: item.id, title: item.title, number: item.number }))) : [];
  return (
    <>
      <DepartmentHeader
        icon={Newspaper}
        color={dept.color}
        title="Central Judicial"
        description="Publicações capturadas do DJEN e vinculadas aos processos. Andamentos do DataJud aparecem na linha do tempo de cada processo."
        actions={can(ctx, "integrations:manage") ? <Link href="/integracoes" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2"><Settings2 className="h-4 w-4" aria-hidden />Configurar fontes</Link> : undefined}
      />
      <Card>
        <CardHeader title="Publicações do DJEN" description={`${total} publicação(ões) capturada(s) para este escritório`} />
        <CardBody>
          {items.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma publicação capturada. Configure um monitoramento por OAB em Integrações para começar.</p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li key={item.id} className="space-y-2 py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{item.title}</p>
                      <p className="mt-1 text-xs text-muted">{[item.court, item.caseNumber ? `Processo ${item.caseNumber}` : null, item.publishedAt ? `Publicada ${formatDate(item.publishedAt, ctx.timezone)}` : null, `Capturada ${formatDateTime(item.receivedAt, ctx.timezone)}`].filter(Boolean).join(" · ")}</p>
                    </div>
                  <Badge tone={item.status === "PROCESSED" ? "success" : "info"}>{item.status === "PROCESSED" ? "Tratada" : NOTICE_KIND_LABEL[item.kind]}</Badge>
                  </div>
                  <details className="rounded-lg border border-border bg-surface-2 px-3 py-2">
                    <summary className="cursor-pointer text-sm">Ler publicação</summary>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{item.content}{item.contentTruncated ? "\n\n[Texto exibido parcialmente]" : ""}</p>
                  </details>
                  {item.case ? <Link className="text-sm font-medium text-primary-text hover:underline" href={`/processos/${item.case.id}?aba=publicacoes`}>Abrir processo: {item.case.title}</Link> : <p className="text-xs text-muted">Ainda sem processo vinculado</p>}
                  {can(ctx, "cases:write") && item.status !== "PROCESSED" && item.status !== "DISCARDED" ? <PublicNoticeLink noticeId={item.id} cases={cases} linkEnabled={!item.case} onProcess={() => {}} /> : null}
                </li>
              ))}
            </ul>
          )}
          {total > items.length ? <p className="mt-4 text-xs text-muted">Exibindo as {items.length} mais recentes.</p> : null}
        </CardBody>
      </Card>
    </>
  );
}
