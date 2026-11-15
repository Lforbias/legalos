"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { linkPublicDjenNoticeAction } from "./public-notice-link-actions";

export function PublicNoticeLink({ noticeId, cases }: { noticeId: string; cases: { id: string; title: string; number: string | null }[] }) {
  const router = useRouter();
  const [caseId, setCaseId] = React.useState("");
  const [message, setMessage] = React.useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`public-notice-case-${noticeId}`}>Vincular publicação a processo</label>
      <select id={`public-notice-case-${noticeId}`} value={caseId} onChange={(event) => setCaseId(event.target.value)} className="min-w-56 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
        <option value="">Escolha o processo</option>
        {cases.map((item) => <option key={item.id} value={item.id}>{item.number ? `${item.number} · ` : ""}{item.title}</option>)}
      </select>
      <Button size="sm" variant="secondary" disabled={!caseId || pending} loading={pending} onClick={() => start(async () => {
        const result = await linkPublicDjenNoticeAction(noticeId, caseId);
        if (!result.ok) setMessage({ tone: "error", text: result.message ?? "Não foi possível vincular a publicação." });
        else {
          setMessage({ tone: "success", text: "Publicação vinculada ao processo." });
          setCaseId("");
          router.refresh();
        }
      })}>Vincular</Button>
      {message ? <Alert tone={message.tone} className="basis-full">{message.text}</Alert> : null}
    </div>
  );
}
