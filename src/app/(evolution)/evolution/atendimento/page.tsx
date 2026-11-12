import Link from "next/link";
import { Bot, ChevronRight, HeadphonesIcon, Mail, MessageCircle, Settings2, Users } from "lucide-react";
import { DEPARTMENTS } from "@/config/evolution-navigation";
import { DepartmentHeader } from "@/components/evolution/department-header";
import { StatCard } from "@/components/evolution/stat-card";
import { EmptyState } from "@/components/evolution/empty-state";
import { DataError } from "@/components/evolution/data-error";
import { requireTenant } from "@/server/session";
import { can } from "@/server/context";
import { unreadTotal, listConversations } from "@/server/services/whatsapp.service";
import { getAccount } from "@/server/services/whatsapp-account.service";
import { listQueues, myAvailability } from "@/server/services/chat-queue.service";
import { formatWaId } from "@/lib/whatsapp/phone";

function messageTime(value: Date | null, timezone: string) {
  if (!value) return "Sem mensagens recentes";
  return value.toLocaleString("pt-BR", { timeZone: timezone, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default async function AtendimentoPage() {
  const { ctx } = await requireTenant();
  const dept = DEPARTMENTS.atendimento;
  const hasChat = can(ctx, "whatsapp:read");
  const hasClients = can(ctx, "clients:read");
  const canManageChat = can(ctx, "whatsapp:manage");
  const canWorkChat = can(ctx, "whatsapp:write");

  const [accountResult, unreadResult, queuesResult, conversationsResult, availabilityResult] = hasChat
    ? await Promise.all([
        getAccount(ctx).then((value) => ({ value, error: false })).catch(() => ({ value: null, error: true })),
        unreadTotal(ctx).then((value) => ({ value, error: false })).catch(() => ({ value: null, error: true })),
        listQueues(ctx).then((value) => ({ value, error: false })).catch(() => ({ value: null, error: true })),
        listConversations(ctx, "open").then((value) => ({ value, error: false })).catch(() => ({ value: null, error: true })),
        canWorkChat ? myAvailability(ctx).then((value) => ({ value, error: false })).catch(() => ({ value: null, error: true })) : Promise.resolve({ value: null, error: false }),
      ])
    : [
        { value: null, error: false },
        { value: null, error: false },
        { value: null, error: false },
        { value: null, error: false },
        { value: null, error: false },
      ];

  const hasError = [accountResult, unreadResult, queuesResult, conversationsResult, availabilityResult].some((result) => result.error);
  const queues = queuesResult.value ?? [];
  const conversations = conversationsResult.value ?? [];
  const activeQueues = queues.filter((queue) => queue.active);
  const totalWaiting = activeQueues.reduce((sum, queue) => sum + queue.waiting, 0);

  if (!hasChat && !hasClients) {
    return (
      <>
        <DepartmentHeader icon={dept.icon} color={dept.color} title={dept.name} description={dept.summary} />
        <EmptyState icon={HeadphonesIcon} title="Sem acesso ao Atendimento" description="Seu perfil não tem permissão para conversas ou clientes. Solicite acesso ao administrador." />
      </>
    );
  }

  const account = accountResult.value;
  const online = availabilityResult.value;

  return (
    <>
      <DepartmentHeader
        icon={dept.icon}
        color={dept.color}
        title={dept.name}
        description="Acompanhe a fila, encontre conversas recentes e acesse os canais de atendimento do escritório."
        actions={hasChat && canManageChat ? <Link href="/atendimento/configuracoes" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm transition hover:bg-surface-2"><Settings2 className="h-4 w-4" aria-hidden />Configurar</Link> : undefined}
      />

      {hasError && <DataError message="Não foi possível carregar alguns dados do Atendimento. Tente novamente." />}

      {hasChat && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={MessageCircle} label="Mensagens não lidas" value={unreadResult.error ? "—" : unreadResult.value ?? 0} color={dept.color} />
            <StatCard icon={Users} label="Aguardando na fila" value={queuesResult.error ? "—" : totalWaiting} detail="em filas ativas" color="#f59e0b" />
            {canWorkChat && <StatCard icon={HeadphonesIcon} label="Meu atendimento" value={availabilityResult.error ? "—" : online ? "Disponível" : "Em pausa"} color={online ? "#10b981" : "#64748b"} />}
            <StatCard icon={MessageCircle} label="WhatsApp" value={accountResult.error ? "—" : !account ? "Não conectado" : account.enabled ? "Habilitado" : "Pausado"} detail={account?.displayPhone ?? undefined} color={account?.enabled ? "#10b981" : "#64748b"} />
          </div>

          {activeQueues.length > 0 && (
            <section className="mt-8">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">Filas de atendimento</h2>
                  <p className="mt-1 text-sm text-muted">Conversas abertas e sem responsável, por fila.</p>
                </div>
                <Link href="/atendimento/operacoes" className="text-sm font-medium text-primary hover:underline">Ver operações</Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {activeQueues.map((queue) => (
                  <Link key={queue.id} href={`/atendimento?fila=${encodeURIComponent(queue.id)}`} className="group flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4 transition hover:border-primary/40 hover:bg-surface-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium group-hover:text-primary">{queue.name}</p>
                      <p className="mt-1 text-xs text-muted">{queue.team?.name ?? "Equipe do escritório"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
                      <span>{queue.waiting} aguardando</span>
                      <span>{queue.open} abertas</span>
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="mt-8">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Conversas recentes</h2>
                <p className="mt-1 text-sm text-muted">Atendimentos abertos mais recentes do escritório.</p>
              </div>
              <Link href="/atendimento" className="text-sm font-medium text-primary hover:underline">Abrir central de conversas</Link>
            </div>
            {conversations.length > 0 ? (
              <div className="divide-y divide-border rounded-xl border border-border bg-surface">
                {conversations.slice(0, 6).map((conversation) => (
                  <Link key={conversation.id} href={`/atendimento?c=${encodeURIComponent(conversation.id)}`} className="flex items-center justify-between gap-4 p-4 transition hover:bg-surface-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{conversation.client?.name ?? conversation.contactName ?? formatWaId(conversation.waId)}</p>
                      <p className="mt-1 truncate text-xs text-muted">{conversation.lastPreview || "Conversa sem prévia de mensagem"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
                      {conversation.unreadCount > 0 && <span className="rounded-full bg-primary/10 px-2 py-1 font-medium text-primary">{conversation.unreadCount} não lidas</span>}
                      <span>{messageTime(conversation.lastMessageAt, ctx.timezone)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : conversationsResult.error ? null : <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">Nenhuma conversa aberta no momento.</p>}
          </section>
        </>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold">Canais e ferramentas</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {hasChat && (
            <Link href="/atendimento" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition hover:bg-surface-2">
              <MessageCircle className="h-5 w-5 text-muted" aria-hidden />
              <div className="min-w-0 flex-1"><p className="text-sm font-medium group-hover:text-primary">Conversas</p><p className="mt-1 text-xs text-muted">WhatsApp, respostas rápidas e modelos</p></div>
              <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
            </Link>
          )}
          {hasChat && (
            <Link href="/atendimento/email" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition hover:bg-surface-2">
              <Mail className="h-5 w-5 text-muted" aria-hidden />
              <div className="min-w-0 flex-1"><p className="text-sm font-medium group-hover:text-primary">E-mail</p><p className="mt-1 text-xs text-muted">Mensagens recebidas e enviadas</p></div>
              <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
            </Link>
          )}
          {hasClients && (
            <Link href="/clientes" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition hover:bg-surface-2">
              <Users className="h-5 w-5 text-muted" aria-hidden />
              <div className="min-w-0 flex-1"><p className="text-sm font-medium group-hover:text-primary">Clientes</p><p className="mt-1 text-xs text-muted">Cadastro, perfil e processos relacionados</p></div>
              <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
            </Link>
          )}
          {can(ctx, "ai:use") && (
            <Link href="/copiloto" className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition hover:bg-surface-2">
              <Bot className="h-5 w-5 text-muted" aria-hidden />
              <div className="min-w-0 flex-1"><p className="text-sm font-medium group-hover:text-primary">Copiloto</p><p className="mt-1 text-xs text-muted">Resumo e ações com revisão humana</p></div>
              <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
            </Link>
          )}
        </div>
      </section>
    </>
  );
}
