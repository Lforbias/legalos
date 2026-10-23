import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { EnableToggle } from "@/modules/ai/enable-toggle";
import { ProviderForm } from "@/modules/rute/provider-form";
import { can } from "@/server/context";
import { requireTenant } from "@/server/session";
import { aiStatus } from "@/server/services/ai.service";
import { getRuteSettings } from "@/server/services/rute-settings.service";

export const metadata: Metadata = { title: "IA do escritório" };
export default async function AiSettingsPage() {
  const { ctx } = await requireTenant();
  if (!can(ctx, "ai:use")) return <AccessDenied />;
  const [settings, status] = await Promise.all([getRuteSettings(ctx), aiStatus(ctx)]);
  const manage = can(ctx, "integrations:manage");
  return <div className="max-w-3xl space-y-5">
    <div><h2 className="text-lg font-semibold">IA do escritório</h2><p className="mt-1 text-sm text-muted">Escolha o provedor, salve a chave e confira a conexão. A chave salva nunca é exibida de volta.</p></div>
    {manage ? <ProviderForm provider={settings.provider} model={settings.model} hasOfficeKey={settings.hasOfficeKey} /> : <p className="text-sm text-muted">Peça a quem administra as integrações para alterar o provedor e a chave.</p>}
    <section className="rounded-lg border border-border p-4 space-y-3"><h3 className="font-medium text-sm">Uso de IA no escritório: {status.orgEnabled ? "ligado" : "desligado"}</h3><p className="text-sm text-muted">Ao usar a IA, o conteúdo necessário à solicitação é enviado ao provedor escolhido. Confira os dados e revise as respostas.</p>{manage ? <EnableToggle enabled={status.orgEnabled} /> : null}</section>
    <p className="text-sm">Assistente RUTE: {settings.assistantEnabled ? "ligado" : "desligado"}. <Link href="/rute?aba=situacao" className="text-primary-text underline">Gerenciar recursos da RUTE</Link></p>
    <Link href="/ia" className="inline-block text-sm text-primary-text underline">Abrir ferramentas de IA</Link>
  </div>;
}
