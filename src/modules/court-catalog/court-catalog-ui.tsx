"use client";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/form";
import Link from "next/link";
import { Search, ExternalLink, Globe, ChevronDown, ChevronRight, Lock, CheckCircle2, Clock, AlertTriangle, XCircle, CircleDashed, Plug } from "lucide-react";
import type { CourtCatalogView, CourtCatalogSummary } from "@/server/services/court-catalog.service";
import type { CourtBranch } from "@/lib/judicial/court-catalog";
import { BRANCH_LABEL } from "@/lib/judicial/court-catalog";
import { CONNECTION_STATE_LABEL, type ConnectionState } from "@/lib/judicial/connection-state";

function integrationBadge(status: string) {
  switch (status) {
    case "OPERATIONAL": return <Badge tone="success">Operacional</Badge>;
    case "PILOT": return <Badge tone="info">Piloto</Badge>;
    case "ADAPTER_READY": return <Badge tone="info">Adaptador pronto</Badge>;
    case "ADAPTER_WIP": return <Badge tone="warning">Em desenvolvimento</Badge>;
    case "CATALOG_ONLY": return <Badge tone="neutral">Cadastrado</Badge>;
    default: return <Badge tone="neutral">Não iniciada</Badge>;
  }
}

function connectionIcon(state: ConnectionState) {
  switch (state) {
    case "OPERATIONAL": return <CheckCircle2 className="h-4 w-4 text-success" />;
    case "PARTIAL": return <Clock className="h-4 w-4 text-warning" />;
    case "NEEDS_AUTHORIZATION": return <Lock className="h-4 w-4 text-warning" />;
    case "AUTH_EXPIRED": return <AlertTriangle className="h-4 w-4 text-danger" />;
    case "TEMPORARY_FAILURE": return <Clock className="h-4 w-4 text-muted" />;
    case "NOT_HOMOLOGATED": return <CircleDashed className="h-4 w-4 text-muted" />;
    case "UNAVAILABLE": return <XCircle className="h-4 w-4 text-muted" />;
    default: return null;
  }
}

function connectionBadge(state: ConnectionState) {
  const label = CONNECTION_STATE_LABEL[state] ?? state;
  switch (state) {
    case "OPERATIONAL": return <Badge tone="success">{label}</Badge>;
    case "PARTIAL": return <Badge tone="warning">{label}</Badge>;
    case "NEEDS_AUTHORIZATION":
    case "AUTH_EXPIRED": return <Badge tone="warning">{label}</Badge>;
    case "TEMPORARY_FAILURE": return <Badge tone="neutral">{label}</Badge>;
    case "NOT_HOMOLOGATED": return <Badge tone="neutral">{label}</Badge>;
    case "UNAVAILABLE": return <Badge tone="neutral">{label}</Badge>;
    default: return null;
  }
}

const BRANCH_ORDER: CourtBranch[] = ["ESTADUAL", "FEDERAL", "TRABALHO", "ELEITORAL", "MILITAR_ESTADUAL", "SUPERIOR"];

function CourtRow({ court }: { court: CourtCatalogView }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-b border-border last:border-b-0">
      <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 transition-colors" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold">{court.code}</span>
            <span className="truncate text-sm">{court.name}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
            {court.ufs.length > 0 && <span>{court.ufs.join(", ")}</span>}
            {court.engineLabel && <span>· {court.engineLabel}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {court.connection && connectionIcon(court.connection.state)}
          {integrationBadge(court.integrationStatus)}
        </div>
      </button>
      {expanded && (
        <div className="space-y-3 border-t border-border/50 bg-surface-2/50 px-4 py-3 pl-11">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-muted">Motor identificado</p>
              <p className="text-sm">{court.engineLabel ?? "Desconhecido"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted">Status da integração</p>
              <p className="text-sm">{court.integrationStatusLabel}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted">UFs atendidas</p>
              <p className="text-sm">{court.ufs.length > 0 ? court.ufs.join(", ") : "Nacional"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted">Graus disponíveis</p>
              <p className="text-sm">{court.degrees.length ? court.degrees.map((degree) => degree === "1" ? "1º grau" : degree === "2" ? "2º grau" : degree).join(", ") : "Não se aplica"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted">Fonte da identificação</p>
              <p className="text-sm">{court.engineSource ?? "Motor não identificado"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted">Fonte/data do catálogo</p>
              <p className="text-sm">{court.verifiedAt ?? "Sem verificação registrada"}{court.verifiedSource ? ` · ${court.verifiedSource}` : ""}</p>
            </div>
          </div>

          {court.connection && (
            <div className="rounded-lg border border-border bg-surface p-3 space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-muted">Estado da conexão</p>
                {connectionBadge(court.connection.state)}
              </div>
              <p className="text-sm">{court.connection.headline}</p>
              {court.connection.nextAction && (
                <p className="text-xs text-muted">Ação necessária: {court.connection.nextAction}</p>
              )}
              {court.connection.lastEvidenceAt && (
                <p className="text-xs text-muted">Última verificação: {new Date(court.connection.lastEvidenceAt).toLocaleDateString("pt-BR")}</p>
              )}
            </div>
          )}

          {!court.connection && (
            <div className="rounded-lg border border-dashed border-border p-3">
              <p className="text-sm text-muted">Este tribunal ainda não tem adaptador configurado no LegalOS. O login e a consulta serão habilitados quando o adaptador estiver pronto e autorizado.</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {court.hasPortalAccess && (
              <Link href="/integracoes" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2">
                <Plug className="h-3.5 w-3.5" />
                Gerenciar conexão
              </Link>
            )}
            {!court.hasPortalAccess && court.integrationStatus === "PILOT" && (
              <Link href="/integracoes" className="inline-flex items-center gap-1.5 rounded-lg border border-primary-text/30 bg-primary-text/5 px-3 py-1.5 text-sm text-primary-text hover:bg-primary-text/10">
                <Plug className="h-3.5 w-3.5" />
                Configurar acesso
              </Link>
            )}
            {court.portalUrl && (
              <a href={court.portalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary-text hover:underline">
                <ExternalLink className="h-3.5 w-3.5" />
                Portal oficial
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function CourtCatalogList({ courts, summary }: { courts: CourtCatalogView[]; summary: CourtCatalogSummary }) {
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<CourtBranch | "">("");

  const filtered = courts.filter((c) => {
    if (branchFilter && c.branch !== branchFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!c.code.toLowerCase().includes(q) && !c.name.toLowerCase().includes(q) && !c.ufs.some((u) => u.toLowerCase() === q)) return false;
    }
    return true;
  });

  const grouped = new Map<CourtBranch, CourtCatalogView[]>();
  for (const c of filtered) {
    const list = grouped.get(c.branch) ?? [];
    list.push(c);
    grouped.set(c.branch, list);
  }

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-2xl font-semibold">{summary.total}</p>
          <p className="text-xs text-muted">Tribunais jurisdicionais</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-2xl font-semibold">{summary.byStatus.find((s) => s.status === "PILOT")?.count ?? 0}</p>
          <p className="text-xs text-muted">Em piloto controlado</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-2xl font-semibold">{summary.byEngine.find((e) => e.engine === "PJE")?.count ?? 0}</p>
          <p className="text-xs text-muted">Usam PJe</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-2xl font-semibold">{summary.referenceCount}</p>
          <p className="text-xs text-muted">Instituições de referência</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Buscar por sigla, nome ou UF…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value as CourtBranch | "")}>
          <option value="">Todos os ramos</option>
          {BRANCH_ORDER.map((b) => <option key={b} value={b}>{BRANCH_LABEL[b]}</option>)}
        </select>
      </div>

      {/* Court list by branch */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Globe className="mx-auto h-8 w-8 text-muted" />
          <p className="mt-2 text-sm text-muted">Nenhum tribunal encontrado para esta busca.</p>
        </div>
      ) : (
        BRANCH_ORDER.filter((b) => grouped.has(b)).map((branch) => (
          <div key={branch} className="overflow-hidden rounded-xl border border-border">
            <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-2.5">
              <h3 className="text-sm font-semibold">{BRANCH_LABEL[branch]}</h3>
              <span className="text-xs text-muted">{grouped.get(branch)!.length} tribunal(is)</span>
            </div>
            {grouped.get(branch)!.map((c) => <CourtRow key={c.code} court={c} />)}
          </div>
        ))
      )}

      {/* Disclaimer */}
      <div className="rounded-xl border border-dashed border-border p-4 text-xs text-muted space-y-1">
        <p>O catálogo lista os 91 órgãos jurisdicionais do inventário nacional, além de {summary.referenceCount} instituições de referência (STF, CNJ, CJF, CSJT).</p>
        <p>Figurar no catálogo não significa que o LegalOS já acessa o portal. Login, consulta de autos e protocolo só são habilitados por adaptador quando o fluxo real estiver implementado, testado e autorizado pelo escritório.</p>
        <p>Fonte: Catálogo oficial do CNJ e portais públicos dos tribunais.</p>
      </div>
    </div>
  );
}
