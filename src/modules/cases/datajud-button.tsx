"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { syncDatajudAction } from "./datajud-actions";

export function DatajudSyncButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [msg, setMsg] = React.useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <div className="space-y-2">
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <Button
        variant="secondary"
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await syncDatajudAction(caseId);
            if (!r.ok || !r.data) return setMsg({ tone: "error", text: r.message ?? "Não foi possível consultar o DataJud." });
            const d = r.data;
            if (!d.found) setMsg({ tone: "info", text: `O DataJud (${d.alias}) não retornou este processo. Ele pode não estar publicado ainda ou ser sigiloso.` });
            else setMsg({ tone: "success", text: `DataJud consultado: ${d.imported} novo(s) andamento(s) importado(s) de ${d.total}.${d.classe ? ` Classe: ${d.classe}.` : ""}` });
            router.refresh();
          })
        }
      >
        Consultar DataJud
      </Button>
    </div>
  );
}
