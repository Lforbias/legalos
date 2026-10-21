import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { formatDateTime } from "@/lib/dates/format";
import { requirePlatform } from "@/server/platform";
import { listPlatformAudit } from "@/server/services/platform.service";

export const metadata: Metadata = { title: "Administração — auditoria" };
export const dynamic = "force-dynamic";

type SP = { acao?: string; resultado?: string; admin?: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { pc } = await requirePlatform();
  const sp = await searchParams;
  const result = sp.resultado === "FAILURE" || sp.resultado === "DENIED" || sp.resultado === "SUCCESS" ? sp.resultado : undefined;
  const rows = await listPlatformAudit(pc, { action: sp.acao, result, platformOnly: sp.admin === "1", take: 150 });
  return (
    <div>
      <PageHeader title="Auditoria" description="Últimos eventos de todos os escritórios: quem, quando, o quê e de onde. Os detalhes internos de cada evento não são exibidos aqui." />
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2" role="search" aria-label="Filtrar auditoria">
        <label htmlFor="acao" className="sr-only">Ação</label>
        <Input id="acao" name="acao" defaultValue={sp.acao ?? ""} placeholder="Ação (ex.: auth.login)" className="w-56" />
        <label htmlFor="resultado" className="sr-only">Resultado</label>
        <Select id="resultado" name="resultado" defaultValue={sp.resultado ?? ""} className="w-40">
          <option value="">Qualquer resultado</option>
          <option value="SUCCESS">Sucesso</option>
          <option value="FAILURE">Falha</option>
          <option value="DENIED">Negado</option>
        </Select>
        <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" name="admin" value="1" defaultChecked={sp.admin === "1"} className="h-4 w-4" /> Só ações de administração</label>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>Filtrar</button>
      </form>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Eventos de auditoria</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th scope="col" className="px-4 py-2 font-medium">Quando</th>
              <th scope="col" className="px-3 py-2 font-medium">Ação</th>
              <th scope="col" className="px-3 py-2 font-medium">Resultado</th>
              <th scope="col" className="px-3 py-2 font-medium">Escritório</th>
              <th scope="col" className="px-3 py-2 font-medium">Usuário</th>
              <th scope="col" className="px-3 py-2 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap px-4 py-2 tabular-nums">{formatDateTime(r.createdAt)}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
                <td className="px-3 py-2"><Badge tone={r.result === "SUCCESS" ? "success" : r.result === "DENIED" ? "warning" : "danger"}>{r.result === "SUCCESS" ? "Sucesso" : r.result === "DENIED" ? "Negado" : "Falha"}</Badge></td>
                <td className="px-3 py-2 text-muted">{r.organizationName ?? "—"}</td>
                <td className="px-3 py-2 text-muted">{r.userEmail ?? "—"}</td>
                <td className="px-3 py-2 text-muted">{r.ipAddress ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="p-8 text-center text-sm text-muted">Nenhum evento encontrado.</p> : null}
      </Card>
    </div>
  );
}
