import Link from "next/link";
import { MessageCircle, Users, Bot, HeadphonesIcon } from "lucide-react";
import { DEPARTMENTS } from "@/config/evolution-navigation";
import { DepartmentHeader } from "@/components/evolution/department-header";
import { StatCard } from "@/components/evolution/stat-card";
import { EmptyState } from "@/components/evolution/empty-state";
import { requireTenant } from "@/server/session";
import { can } from "@/server/context";
import { unreadTotal } from "@/server/services/whatsapp.service";

export default async function AtendimentoPage() {
  const { ctx } = await requireTenant();
  const dept = DEPARTMENTS.atendimento;
  const chatUnread = can(ctx, "whatsapp:read") ? await unreadTotal(ctx).catch(() => 0) : 0;
  const hasChat = can(ctx, "whatsapp:read");
  const hasClients = can(ctx, "clients:read");

  if (!hasChat && !hasClients) {
    return (
      <>
        <DepartmentHeader icon={dept.icon} color={dept.color} title={dept.name} description={dept.summary} />
        <EmptyState icon={HeadphonesIcon} title="Sem acesso ao Atendimento" description="Seu perfil não tem permissão para conversas ou clientes. Solicite acesso ao administrador." />
      </>
    );
  }

  return (
    <>
      <DepartmentHeader icon={dept.icon} color={dept.color} title={dept.name} description={dept.summary} />

      {hasChat && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={MessageCircle} label="Mensagens não lidas" value={chatUnread} color={dept.color} />
        </div>
      )}

      <h2 className="mt-8 mb-4 text-base font-semibold">Estações de trabalho</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {hasChat && (
          <Link href="/atendimento" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
            <MessageCircle className="h-5 w-5 text-muted" aria-hidden />
            <div>
              <p className="text-sm font-medium group-hover:text-primary">Conversas</p>
              <p className="text-[12px] text-muted">WhatsApp, respostas rápidas e modelos</p>
            </div>
          </Link>
        )}
        {hasClients && (
          <Link href="/clientes" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
            <Users className="h-5 w-5 text-muted" aria-hidden />
            <div>
              <p className="text-sm font-medium group-hover:text-primary">Clientes</p>
              <p className="text-[12px] text-muted">Cadastro com perfil completo e processos</p>
            </div>
          </Link>
        )}
        {can(ctx, "ai:use") && (
          <Link href="/copiloto" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-shadow hover:shadow-md">
            <Bot className="h-5 w-5 text-muted" aria-hidden />
            <div>
              <p className="text-sm font-medium group-hover:text-primary">Copiloto</p>
              <p className="text-[12px] text-muted">Transcrição vira resumo, ações e documentos</p>
            </div>
          </Link>
        )}
      </div>
    </>
  );
}
