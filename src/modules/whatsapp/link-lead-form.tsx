"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { linkExistingLeadAction } from "./actions";

export function LinkLeadForm({ conversationId, options }: {
  conversationId: string;
  options: { id: string; name: string; interest: string | null }[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  return (
    <form className="space-y-2" onSubmit={(event) => {
      event.preventDefault();
      const leadId = new FormData(event.currentTarget).get("leadId");
      if (typeof leadId !== "string" || !leadId) return;
      setError("");
      start(async () => {
        const result = await linkExistingLeadAction(conversationId, leadId);
        if (!result.ok) setError(result.message ?? "Não foi possível vincular o lead.");
      });
    }}>
      <label className="block text-sm">
        Lead existente no CRM
        <select className="mt-1 block w-full rounded border border-border bg-surface p-2" name="leadId" required defaultValue="">
          <option value="">Selecione entre os leads recentes</option>
          {options.map(lead => <option key={lead.id} value={lead.id}>{lead.name}{lead.interest ? ` · ${lead.interest}` : ""}</option>)}
        </select>
      </label>
      <Button type="submit" size="sm" loading={pending}>Vincular ao CRM</Button>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </form>
  );
}
