"use client";

import { useState } from "react";
import Link from "next/link";
import { Background, Controls, MarkerType, Position, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { formatMoneyBR } from "@/lib/validation/money";
import { formatYmd } from "@/lib/dates/ymd";
import { StageSelect } from "./lead-controls";
import { LEAD_STAGES, LEAD_STAGE_LABEL, type LeadStageKey } from "./schemas";

type Lead = {
  id: string;
  name: string;
  stage: LeadStageKey;
  interest: string | null;
  ownerName: string | null;
  estimatedValue: string | null;
  nextActionDate: string | null;
};
type Summary = { stage: LeadStageKey; count: number; amount: string };

const edges: Edge[] = [
  { id: "new-contact", source: "NEW", target: "CONTACTED" },
  { id: "contact-meeting", source: "CONTACTED", target: "MEETING" },
  { id: "meeting-proposal", source: "MEETING", target: "PROPOSAL" },
  { id: "proposal-won", source: "PROPOSAL", target: "WON" },
].map(edge => ({ ...edge, markerEnd: { type: MarkerType.ArrowClosed } }));

export function PipelineView({ leads, summary, mode, canWrite }: {
  leads: Lead[];
  summary: Summary[];
  mode: "flow" | "table";
  canWrite: boolean;
}) {
  const [stage, setStage] = useState<LeadStageKey | "">("");
  const [sort, setSort] = useState("contact");
  const visible = leads.filter(lead => !stage || lead.stage === stage).sort((a, b) =>
    sort === "name" ? a.name.localeCompare(b.name, "pt-BR") :
      (a.nextActionDate ?? "9999").localeCompare(b.nextActionDate ?? "9999"));
  const nodes: Node[] = LEAD_STAGES.map((key, index) => {
    const total = summary.find(item => item.stage === key);
    return {
      id: key,
      position: key === "LOST" ? { x: 750, y: 180 } : { x: index * 250, y: 30 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      selected: stage === key,
      ariaLabel: `Filtrar ${LEAD_STAGE_LABEL[key]}`,
      data: { label: <div><strong>{LEAD_STAGE_LABEL[key]}</strong><p>{total?.count ?? 0} atendimentos</p><p>{formatMoneyBR(total?.amount ?? "0")} estimados</p></div> },
      style: { width: 210, borderRadius: 12, background: "var(--color-surface, #fff)", color: "var(--fg, #111827)", border: stage === key ? "2px solid #2563eb" : "1px solid #94a3b8", padding: 16 },
    };
  });

  return <div className="space-y-4">
    {mode === "flow" ? <>
      <p className="text-sm text-muted">Selecione uma etapa para ver seus atendimentos. As setas mostram a sequência comercial. Ganhos e perdas são registrados na ficha do lead.</p>
      <div className="h-[360px] overflow-hidden rounded-xl border border-border" aria-label="Fluxo do atendimento comercial">
        <ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable={false} nodesConnectable={false} edgesFocusable={false} onNodeClick={(_, node) => setStage(node.id as LeadStageKey)} minZoom={0.2} maxZoom={1.5}>
          <Background /><Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </> : null}
    <div className="flex flex-wrap items-center gap-3">
      <label className="text-sm">Etapa <select className="rounded border border-border bg-surface p-2" value={stage} onChange={event => setStage(event.target.value as LeadStageKey | "")}>
        <option value="">Todas</option>{LEAD_STAGES.map(key => <option key={key} value={key}>{LEAD_STAGE_LABEL[key]}</option>)}
      </select></label>
      <label className="text-sm">Ordenar por <select className="rounded border border-border bg-surface p-2" value={sort} onChange={event => setSort(event.target.value)}>
        <option value="contact">Próximo contato</option><option value="name">Nome</option>
      </select></label>
      <span className="text-sm text-muted" aria-live="polite">{visible.length} atendimentos exibidos</span>
    </div>
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Atendimentos comerciais filtrados</caption>
        <thead className="bg-surface-2"><tr>{["Nome", "Interesse", "Responsável", "Valor estimado", "Próximo contato", "Etapa"].map(label => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
        <tbody>{visible.map(lead => <tr key={lead.id} className="border-t border-border">
          <td className="p-3"><Link className="font-medium underline underline-offset-4" href={`/crm/${lead.id}`}>{lead.name}</Link></td>
          <td className="p-3">{lead.interest ?? "—"}</td><td className="p-3">{lead.ownerName ?? "Sem responsável"}</td>
          <td className="p-3">{lead.estimatedValue ? formatMoneyBR(lead.estimatedValue) : "—"}</td>
          <td className="p-3">{lead.nextActionDate ? formatYmd(lead.nextActionDate) : "Sem data"}</td>
          <td className="p-3">{canWrite && lead.stage !== "WON" && lead.stage !== "LOST" ? <StageSelect leadId={lead.id} stage={lead.stage} compact /> : LEAD_STAGE_LABEL[lead.stage]}</td>
        </tr>)}</tbody>
      </table>
      {visible.length === 0 ? <p className="p-6 text-sm text-muted">Nenhum atendimento corresponde aos filtros.</p> : null}
    </div>
  </div>;
}
