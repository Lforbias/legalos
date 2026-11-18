"use client";

import { Bot, Briefcase, CalendarClock, CheckSquare, CornerDownRight, FileText, Folder, Hourglass, Lock, MessageSquare, MoreHorizontal, Paperclip, Pencil, Scale, Trash2, Users, Video } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { cn } from "@/lib/utils";
import { WORK_PURPOSE_LABEL, type ResourceKind, type WorkPurpose } from "./constants";
import type { CoworkMessageDTO, ResourceCard } from "./types";
import { formatBytes, formatTime, PersonAvatar } from "./ui";

const KIND_ICON: Record<ResourceKind, React.ComponentType<{ className?: string }>> = {
  CLIENT: Users,
  CASE: Scale,
  DOCUMENT: FileText,
  FOLDER: Folder,
  TASK: CheckSquare,
  DEADLINE: Hourglass,
  EVENT: CalendarClock,
  MEETING: Video,
};

/** Cartão de recurso. Sem acesso, não mostra título, número, nome nem data: só o tipo e o aviso de restrição. */
export function ResourceCardView({ card }: { card: ResourceCard }) {
  const Icon = KIND_ICON[card.kind] ?? Briefcase;
  if (!card.accessible) {
    return (
      <div className="flex max-w-md items-center gap-3 rounded-xl border border-dashed border-border bg-surface-2/50 px-3 py-2.5 text-xs text-muted" data-testid="cowork-card-restricted">
        <Lock className="h-4 w-4 shrink-0" aria-hidden />
        <span>
          <span className="font-medium">{card.label}</span> — conteúdo restrito. Você não tem acesso a este item.
        </span>
      </div>
    );
  }
  return (
    <Link href={card.href} className="group flex max-w-md items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-surface-2" data-testid="cowork-card">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted group-hover:text-fg">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-wide text-muted">{card.label}</span>
        <span className="block truncate text-sm font-medium">{card.title}</span>
        {card.subtitle ? <span className="block truncate text-xs text-muted">{card.subtitle}</span> : null}
      </span>
    </Link>
  );
}

/** Texto com menções destacadas. Renderizado como texto (sem HTML), preservando quebras de linha. */
function Body({ text, mentionNames }: { text: string; mentionNames: string[] }) {
  if (!mentionNames.length) return <>{text}</>;
  const escaped = mentionNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length);
  const re = new RegExp(`(@(?:${escaped.join("|")}))`, "g");
  return (
    <>
      {text.split(re).map((part, i) =>
        part.startsWith("@") && mentionNames.includes(part.slice(1)) ? (
          <span key={i} className="rounded bg-primary/10 px-0.5 font-medium text-primary-text">
            {part}
          </span>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  );
}

export function MessageItem({
  message,
  compact,
  highlight,
  nameOf,
  meId,
  inThread,
  onReply,
  onEdit,
  onDelete,
  onConvert,
}: {
  message: CoworkMessageDTO;
  compact: boolean;
  highlight?: boolean;
  nameOf: (id: string) => string | undefined;
  meId: string;
  inThread?: boolean;
  onReply?: (m: CoworkMessageDTO) => void;
  onEdit?: (m: CoworkMessageDTO, body: string) => Promise<boolean>;
  onDelete?: (m: CoworkMessageDTO) => void;
  onConvert?: (m: CoworkMessageDTO) => void;
}) {
  const [menu, setMenu] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(message.body);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (highlight) ref.current?.scrollIntoView({ block: "center" });
  }, [highlight]);
  const system = message.author.kind === "SYSTEM";
  const mentionsMe = message.mentionedIds.includes(meId);
  const mentionNames = message.mentionedIds.map(nameOf).filter((x): x is string => !!x);
  const hasActions = !message.deleted && !system && Boolean(onReply || onConvert || message.canEdit || message.canDelete);

  if (system) {
    return (
      <div ref={ref} id={`m-${message.id}`} className="px-4 py-1.5 sm:px-6" data-testid="cowork-system-message">
        <div className="flex items-start gap-2 text-xs text-muted">
          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong" aria-hidden />
          <div className="min-w-0 space-y-1.5">
            <p>
              {message.body} <span className="opacity-70">· {formatTime(message.createdAt)}</span>
            </p>
            {message.cards.map((c) => (
              <ResourceCardView key={`${c.kind}:${c.id}`} card={c} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      id={`m-${message.id}`}
      data-testid="cowork-message"
      data-seq={message.seq}
      className={cn(
        "group relative flex gap-3 px-4 transition-colors hover:bg-surface-2/50 sm:px-6",
        compact ? "py-0.5" : "pt-3 pb-0.5",
        highlight && "bg-warning-bg/60",
        mentionsMe && "border-l-2 border-primary bg-primary/[0.04]",
      )}
    >
      <div className="w-9 shrink-0">{compact ? null : <PersonAvatar id={message.author.id} name={message.author.name} size={36} />}</div>
      <div className="min-w-0 flex-1">
        {compact ? null : (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">{message.author.name}</span>
            {message.author.kind === "AGENT" ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/40 px-1.5 text-[10px] font-medium text-accent-text">
                <Bot className="h-3 w-3" aria-hidden /> IA
              </span>
            ) : null}
            <time className="text-[11px] text-muted" dateTime={message.createdAt}>
              {formatTime(message.createdAt)}
            </time>
          </div>
        )}
        {message.deleted ? (
          <p className="text-sm italic text-muted">Mensagem excluída.</p>
        ) : editing ? (
          <form
            className="mt-1 space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (onEdit && (await onEdit(message, draft))) setEditing(false);
            }}
          >
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={4000} aria-label="Editar mensagem" className="w-full rounded-lg border border-border bg-bg/45 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
            <div className="flex gap-2 text-xs">
              <button type="submit" className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-fg">Salvar</button>
              <button type="button" className="rounded-md px-3 py-1.5 text-muted hover:bg-surface-2" onClick={() => { setEditing(false); setDraft(message.body); }}>Cancelar</button>
            </div>
          </form>
        ) : message.body ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-6">
            <Body text={message.body} mentionNames={mentionNames} />
            {message.editedAt ? <span className="ml-1 text-[11px] text-muted">(editada)</span> : null}
          </p>
        ) : null}
        {message.attachments.length ? (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {message.attachments.map((a) => (
              <a key={a.id} href={`/api/cowork/attachments/${a.id}`} className="inline-flex max-w-xs items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs hover:bg-surface-2" data-testid="cowork-attachment">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                <span className="truncate">{a.name}</span>
                <span className="shrink-0 text-muted">{formatBytes(a.sizeBytes)}</span>
              </a>
            ))}
          </div>
        ) : null}
        {message.cards.length ? (
          <div className="mt-1.5 space-y-1.5">
            {message.cards.map((c) => (
              <ResourceCardView key={`${c.kind}:${c.id}`} card={c} />
            ))}
          </div>
        ) : null}
        {message.work.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {message.work.map((w, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success-bg px-2 py-0.5 text-[11px] text-success">
                <CheckSquare className="h-3 w-3" aria-hidden /> Virou {WORK_PURPOSE_LABEL[w.purpose as WorkPurpose]?.toLowerCase() ?? "trabalho"}
                {w.card.accessible ? <>: <Link className="underline" href={w.card.href}>{w.card.title}</Link></> : null}
              </span>
            ))}
          </div>
        ) : null}
        {!inThread && message.replyCount > 0 && onReply ? (
          <button type="button" onClick={() => onReply(message)} className="mt-1 inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium text-accent-text hover:bg-surface-2" data-testid="cowork-thread-link">
            <CornerDownRight className="h-3.5 w-3.5" aria-hidden />
            {message.replyCount} {message.replyCount === 1 ? "resposta" : "respostas"}
          </button>
        ) : null}
      </div>
      {hasActions ? (
        <div className="absolute right-3 top-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5 shadow-sm">
            {!inThread && onReply ? (
              <button type="button" onClick={() => onReply(message)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg" title="Responder em thread" aria-label="Responder em thread">
                <MessageSquare className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            <div className="relative">
              <button type="button" onClick={() => setMenu((v) => !v)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Mais ações da mensagem" aria-expanded={menu} data-testid="cowork-message-menu">
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </button>
              {menu ? (
                <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-border bg-surface p-1 text-sm shadow-lg" role="menu" onMouseLeave={() => setMenu(false)}>
                  {onConvert ? (
                    <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-surface-2" onClick={() => { setMenu(false); onConvert(message); }}>
                      <CheckSquare className="h-4 w-4 text-muted" aria-hidden /> Transformar em trabalho
                    </button>
                  ) : null}
                  {message.canEdit && onEdit ? (
                    <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-surface-2" onClick={() => { setMenu(false); setDraft(message.body); setEditing(true); }}>
                      <Pencil className="h-4 w-4 text-muted" aria-hidden /> Editar
                    </button>
                  ) : null}
                  {message.canDelete && onDelete ? (
                    <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-danger hover:bg-danger-bg" onClick={() => { setMenu(false); onDelete(message); }}>
                      <Trash2 className="h-4 w-4" aria-hidden /> Excluir
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
