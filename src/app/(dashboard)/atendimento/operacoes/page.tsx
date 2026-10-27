import { EmailSettings } from "@/modules/whatsapp/email-ui";
import { emailAccountStatus } from "@/server/services/chat-email.service";
import { db } from "@/lib/db/client";
import { MetaTemplateForm } from "@/modules/whatsapp/meta-template-form";
import Link from "next/link";
import { AccessDenied } from "@/components/layout/access-denied";
import { PageHeader } from "@/components/layout/page-header";
import { requireTenant } from "@/server/session";
import { can } from "@/server/context";
import { listChatResources,chatAssistEnabled } from "@/server/services/chat-workbench.service";
import { listQueues } from "@/server/services/chat-queue.service";
import { listLabels } from "@/server/services/chat-meta.service";
import { WorkbenchManager } from "@/modules/whatsapp/workbench-manager";
export const dynamic="force-dynamic";
export const metadata={title:"Operações do Chat"};
export default async function ChatOperations() {
  const {ctx}=await requireTenant();if(!can(ctx,"whatsapp:write"))return <AccessDenied/>;
  const [resources,enabled,queues,labels]=await Promise.all([listChatResources(ctx),chatAssistEnabled(ctx),listQueues(ctx),listLabels(ctx)]);
  const email=can(ctx,"whatsapp:manage")?await emailAccountStatus(ctx):null;
  const accounts=can(ctx,"whatsapp:manage")?await db.whatsappAccount.findMany({where:{organizationId:ctx.organizationId,provider:"META",wabaId:{not:null}},select:{id:true,label:true}}):[];
  return <div className="mx-auto max-w-5xl space-y-5 pb-12"><PageHeader title="Operações do Chat" description="Copiloto, conhecimento do escritório e rotinas de atendimento." actions={<Link className="text-sm underline" href="/atendimento">Voltar ao Chat</Link>}/><WorkbenchManager resources={resources} enabled={enabled} manage={can(ctx,"whatsapp:manage")} queues={queues} labels={labels}/>{can(ctx,"whatsapp:manage")&&<EmailSettings account={email?{...email,lastCheckedAt:email.lastCheckedAt?.toISOString()??null}:null} queues={queues}/>}<Link className="text-sm underline" href="/atendimento/email">Abrir caixa de e-mail</Link>{can(ctx,"whatsapp:manage")&&<MetaTemplateForm accounts={accounts}/>}<section className="rounded-xl border border-border bg-surface p-5"><h2 className="font-semibold">Conexões e relatórios</h2><div className="mt-3 flex flex-wrap gap-4 text-sm underline"><Link href="/atendimento/configuracoes">Campanhas, números, modelos e automações</Link><Link href="/atendimento/relatorios">NPS e indicadores de atendimento</Link><Link href="/integracoes">API, webhooks e integrações</Link></div><p className="mt-3 text-sm text-muted">Os canais desta rodada são WhatsApp e e-mail. O e-mail exige uma caixa IMAP/SMTP compatível e conferência com o provedor real. SSO, chaves de segurança e aplicativos nativos são projetos próprios. Nenhuma certificação de segurança é declarada por esta implementação.</p></section></div>;
}
