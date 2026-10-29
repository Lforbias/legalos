"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Input, Select } from "@/components/ui/form";
import { buttonVariants } from "@/components/ui/button";
import { dateToYmd, formatYmd } from "@/lib/dates/ymd";
import { NOTICE_KIND_LABEL, NOTICE_STATUS_LABEL } from "./schemas";
import { ORIGIN_LABEL, bulkNoticeSchema } from "./list-schemas";
import { bulkNoticeAction } from "./bulk-actions";
import { NoticeStateChips } from "@/modules/box/notice-states";
import { originLabel } from "@/lib/judicial/notice-state";
import type { listNotices } from "@/server/services/notice.service";

type Row = Awaited<ReturnType<typeof listNotices>>["items"][number];
const TONE = { NEW: "warning", DISTRIBUTED: "info", PROCESSED: "success", DISCARDED: "neutral" } as const;
const ACTIONS = { ASSIGN_USER: "Distribuir para pessoa", ASSIGN_TEAM: "Distribuir para equipe", ADD_TAGS: "Adicionar etiquetas", SNOOZE: "Adormecer", PROCESS: "Marcar como tratadas" } as const;

export function NoticeTable({ rows, members, teams, canWrite, v2 = false }: { rows: Row[]; members: { id: string; name: string }[]; teams: { id: string; name: string }[]; canWrite: boolean; v2?: boolean }) {
  const router = useRouter();
  const teamNames = new Map(teams.map(t => [t.id, t.name]));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<keyof typeof ACTIONS>("ASSIGN_USER");
  const [target, setTarget] = useState("");
  const [tags, setTags] = useState("");
  const [until, setUntil] = useState("");
  const [review, setReview] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const chosen = rows.filter(n => selected.has(n.id));
  const payload = { action, selection: chosen.map(n => ({ id: n.id, updatedAt: new Date(n.updatedAt).toISOString() })), userId: target, teamId: target, tags: tags.split(",").map(t => t.trim()).filter(Boolean), until };
  function check() {
    const result = bulkNoticeSchema.safeParse(payload);
    if (!result.success) { setError(true); setMessage(result.error.issues[0]?.message ?? "Confira o lote."); return; }
    setMessage(""); setReview(true);
  }
  // Box 2.0: enquanto há seleção em andamento, a atualização ao vivo espera (não derruba o lote que a pessoa está montando).
  return <div className="space-y-3" data-live-hold={selected.size > 0 || review ? "true" : undefined}>
    {message ? <Alert tone={error ? "error" : "success"}>{message}</Alert> : null}
    {canWrite ? <Card className="space-y-3 p-4">
      <p className="text-sm">{selected.size} selecionada(s). A seleção vale apenas para esta página, no máximo 100 por lote.</p>
      <fieldset disabled={pending || review} className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Ação em lote<Select value={action} onChange={e => { setAction(e.target.value as keyof typeof ACTIONS); setTarget(""); }}>{Object.entries(ACTIONS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</Select></label>
        {action === "ASSIGN_USER" || action === "ASSIGN_TEAM" ? <label className="text-sm">Destino<Select value={target} onChange={e => setTarget(e.target.value)}><option value="">Selecione…</option>{(action === "ASSIGN_USER" ? members : teams).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></label> : null}
        {action === "ADD_TAGS" ? <label className="text-sm">Etiquetas a adicionar<Input value={tags} onChange={e => setTags(e.target.value)} placeholder="urgente, revisar" /><span className="text-xs text-muted">Preserva as etiquetas existentes.</span></label> : null}
        {action === "SNOOZE" ? <label className="text-sm">Adormecer até<Input type="date" value={until} onChange={e => setUntil(e.target.value)} /></label> : null}
        <button className={buttonVariants({ variant: "secondary" })} disabled={!chosen.length} onClick={check}>Revisar lote</button>
      </fieldset>
      {review ? <section aria-label="Revisão do lote" className="space-y-2 border-t border-border pt-3">
        <p className="font-medium">{ACTIONS[action]} — {chosen.length} intimação(ões)</p>
        {target ? <p className="text-sm">Destino: {(action === "ASSIGN_USER" ? members : teams).find(m => m.id === target)?.name}</p> : null}
        {action === "ADD_TAGS" ? <p className="text-sm">Adicionar: {tags}</p> : null}
        {action === "SNOOZE" ? <p className="text-sm">Até: {formatYmd(until)}</p> : null}
        <ul className="max-h-40 list-inside list-disc overflow-auto text-sm">{chosen.map(n => <li key={n.id}>{n.title}{n.caseNumber ? ` · ${n.caseNumber}` : ""}</li>)}</ul>
        <p className="text-xs text-muted">Todas as selecionadas serão alteradas juntas. Se alguma mudou ou não puder receber a ação, o lote inteiro será recusado.</p>
        <div className="flex gap-2"><button disabled={pending} className={buttonVariants({})} onClick={() => startTransition(async () => {
          const result = await bulkNoticeAction(payload);
          setError(!result.ok); setMessage(result.ok ? `${result.data?.count ?? 0} intimação(ões) atualizada(s).` : result.message ?? "Não foi possível aplicar o lote.");
          setReview(false);
          if (result.ok) { setSelected(new Set()); router.refresh(); }
        })}>{pending ? "Aplicando…" : "Confirmar ação em lote"}</button><button disabled={pending} className={buttonVariants({ variant: "secondary" })} onClick={() => setReview(false)}>Voltar à seleção</button></div>
      </section> : null}
    </Card> : null}
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Intimações</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                {canWrite ? <th className="px-3 py-2"><input type="checkbox" aria-label="Selecionar esta página (até 100 intimações)" checked={selected.size > 0 && rows.slice(0, 100).every(n => selected.has(n.id))} disabled={pending} onChange={e => { setReview(false); setSelected(e.target.checked ? new Set(rows.slice(0, 100).map(n => n.id)) : new Set()); }} /></th> : null}
                <th scope="col" className="px-4 py-2 font-medium">Recebida</th>
                <th scope="col" className="px-3 py-2 font-medium">Intimação</th>
                <th scope="col" className="px-3 py-2 font-medium">Origem</th>
                <th scope="col" className="px-3 py-2 font-medium">Processo</th>
                <th scope="col" className="px-3 py-2 font-medium">Responsável</th>
                <th scope="col" className="px-3 py-2 font-medium">Situação</th>
                {v2 ? <th scope="col" className="px-3 py-2 font-medium">No LegalOS e no tribunal</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((n) => (
                <tr key={n.id} data-viewed={v2 ? String(n.firstViewedAt !== null) : undefined} className="border-b border-border last:border-0">
                  {canWrite ? <td className="px-3 py-2.5"><input type="checkbox" aria-label={`Selecionar ${n.title}`} checked={selected.has(n.id)} disabled={pending || (!selected.has(n.id) && selected.size >= 100)} onChange={e => { setReview(false); const next = new Set(selected); if (e.target.checked) next.add(n.id); else next.delete(n.id); setSelected(next); }} /></td> : null}
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{formatYmd(dateToYmd(n.receivedAt))}</td>
                  <td className="px-3 py-2.5">
                    <Link href={`/caixa-de-entrada/${n.id}`} className={v2 && n.firstViewedAt === null && (n.status === "NEW" || n.status === "DISTRIBUTED") ? "font-semibold hover:underline" : "font-medium hover:underline"}>{n.title}</Link>
                    <p className="text-xs text-muted">
                      {NOTICE_KIND_LABEL[n.kind]}{n.court ? ` · ${n.court}` : ""}
                      {n.duplicateOfId ? <Badge tone="warning" className="ml-2">Possível duplicata</Badge> : null}
                      {n.snoozedUntil ? <Badge tone="neutral" className="ml-2">Adormecida até {formatYmd(dateToYmd(n.snoozedUntil))}</Badge> : null}
                      {n.tags.map((t) => (
                        <Badge key={t} tone="info" className="ml-1">{t}</Badge>
                      ))}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted">{v2 && n.originKind ? <>{originLabel(n.originKind)}{n.courtCode ? <span className="block">{n.courtCode}</span> : null}</> : n.source === "IMPORTED" ? n.externalKey?.startsWith("djen:") ? ORIGIN_LABEL.DJEN : n.externalKey?.startsWith("mni:") ? ORIGIN_LABEL.MNI : ORIGIN_LABEL.OTHER_IMPORT : ORIGIN_LABEL[n.source]}</td>
                  <td className="px-3 py-2.5">
                    {n.case ? <Link href={`/processos/${n.case.id}`} className="hover:underline">{n.case.title}</Link> : <span className="text-muted">{n.caseNumber ?? "Sem processo"}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-muted">{n.assigneeName ?? (n.teamId ? `Equipe ${teamNames.get(n.teamId) ?? ""}`.trim() : "—")}</td>
                  <td className="px-3 py-2.5"><Badge tone={TONE[n.status]}>{NOTICE_STATUS_LABEL[n.status]}</Badge></td>
                  {v2 ? <td className="px-3 py-2.5"><NoticeStateChips n={n} /></td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
  </div>;
}
