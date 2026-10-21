import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { NAV_ITEMS, getNavItem } from "@/config/navigation";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "Módulo" };

export default async function ModulePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { ctx } = await requireTenant();

  if (key === "ajuda") {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Roadmap e status dos módulos" description="O que já está operacional e o que será entregue em cada fase." />
        <Card>
          <ul className="divide-y divide-border">
            {NAV_ITEMS.map((n) => (
              <li key={n.key} className="flex items-start justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{n.label}</p>
                  <p className="text-xs text-muted">{n.summary}</p>
                </div>
                {n.implemented ? <Badge tone="success">Disponível</Badge> : <Badge tone="neutral">Fase {n.phase}</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    );
  }

  const item = getNavItem(key);
  if (!item || item.implemented) notFound();
  if (item.permission && !can(ctx, item.permission)) return <AccessDenied />;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={item.label} />
      <Card>
        <CardBody className="space-y-3">
          <Badge tone="info">Planejado para a Fase {item.phase}</Badge>
          <p className="text-sm">{item.summary}</p>
          <p className="text-sm text-muted">
            Este módulo ainda não foi implementado. Para evitar telas com dados fictícios, ele permanece indisponível até ser entregue com persistência, validações e permissões
            verificadas no servidor.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
