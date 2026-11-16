import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/dates/format";
import { mcpUrl } from "@/lib/mcp/http";
import { ConnectGuide, ConnectionList, KeyForm, McpAccessPanel } from "@/modules/rute/rute-ui";
import { can } from "@/server/context";
import { listMcpConnections } from "@/server/services/mcp-auth.service";
import { getRuteSettings, MCP_ENABLED } from "@/server/services/rute-settings.service";
import { requireTenant } from "@/server/session";

export const metadata: Metadata = { title: "MCP — Integrações" };

export default async function McpPage() {
  const { ctx, organization } = await requireTenant();
  if (!can(ctx, "ai:use")) return <AccessDenied />;

  const canManage = can(ctx, "integrations:manage");
  const [settings, connections] = await Promise.all([
    getRuteSettings(ctx),
    listMcpConnections(ctx),
  ]);
  const enabled = MCP_ENABLED && settings.mcpEnabled && !settings.emergencyStop;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Conexões MCP" description="Conecte o Claude e gerencie o acesso ao seu escritório." />
      <Link className="text-sm font-medium text-primary underline" href="/integracoes">Voltar a Integrações</Link>
      {!MCP_ENABLED ? <Alert tone="warning">O acesso MCP está desativado no servidor.</Alert> : null}
      {settings.emergencyStop ? <Alert tone="error">A parada de emergência do escritório bloqueia as conexões MCP.</Alert> : null}
      <McpAccessPanel enabled={settings.mcpEnabled} canManage={canManage && MCP_ENABLED} />
      <Card>
        <CardHeader title="Conectar uma IA" />
        <CardBody><ConnectGuide mcpUrl={mcpUrl()} enabled={enabled} /></CardBody>
      </Card>
      {canManage && enabled ? (
        <Card>
          <CardHeader title="Chave MCP para linha de comando" />
          <CardBody><KeyForm /></CardBody>
        </Card>
      ) : null}
      <Card>
        <CardHeader title={canManage ? "Conexões do escritório" : "Minhas conexões"} />
        <CardBody>
          <ConnectionList items={connections.map((connection) => ({
            id: connection.id,
            kind: connection.kind,
            name: connection.name,
            scopes: connection.scopes,
            userName: connection.userName,
            lastUsedAt: connection.lastUsedAt ? formatDateTime(connection.lastUsedAt, organization.timezone) : null,
            createdAt: connection.createdAt.toISOString(),
            status: connection.status,
          }))} />
        </CardBody>
      </Card>
    </div>
  );
}
