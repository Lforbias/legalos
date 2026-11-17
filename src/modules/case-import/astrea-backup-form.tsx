"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import type { ImportReport } from "@/server/import/astrea-import";

export function AstreaBackupForm() {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(mode: "simular" | "importar") {
    if (!file || pending) return;
    setError(null);
    if (!file.name.toLowerCase().endsWith(".zip") || file.size > 48 * 1024 * 1024) {
      setError("Selecione um ZIP de até 48 MB.");
      return;
    }
    start(async () => {
      try {
        const response = await fetch(`/api/importacoes/astrea?modo=${mode}`, { method: "POST", body: file });
        const result = await response.json();
        if (response.ok) setReport(result as ImportReport);
        else setError(result.error ?? "Não foi possível concluir a operação.");
      } catch {
        setError("A conexão caiu antes de receber o relatório. Simule novamente para conferir o resultado antes de tentar outra vez.");
      }
    });
  }

  return (
    <Card>
      <CardHeader title="Importar backup do Astrea" description="Selecione o ZIP exportado pelo Astrea. Simule primeiro para conferir o que será importado." />
      <CardBody className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Field label="Backup do Astrea" htmlFor="astrea-backup" hint="Arquivo ZIP de até 48 MB.">
          <Input id="astrea-backup" type="file" accept=".zip,application/zip" disabled={pending} onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setReport(null);
            setError(null);
          }} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" loading={pending} disabled={!file} onClick={() => submit("simular")}>Simular importação</Button>
          {report?.dryRun ? <Button disabled={pending} onClick={() => submit("importar")}>Confirmar importação</Button> : null}
        </div>
        {report ? (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">{report.dryRun ? "Resultado da simulação" : "Resultado da importação"}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted">
                  <tr><th scope="col">Dados</th><th scope="col" className="text-right">Lidos</th><th scope="col" className="text-right">{report.dryRun ? "A importar" : "Importados"}</th><th scope="col" className="text-right">Já importados</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {Object.entries(report.entidades).map(([entity, counts]) => (
                    <tr key={entity}>
                      <th scope="row" className="py-1 text-left font-medium first-letter:uppercase">{entity}</th>
                      <td className="text-right">{counts.lidos}</td><td className="text-right">{counts.importados}</td><td className="text-right">{counts.jaImportados}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer">Ignorados e avisos</summary>
              <ul className="mt-2 space-y-1 text-muted">
                {Object.entries(report.entidades).flatMap(([entity, counts]) => (
                  [...Object.entries(counts.ignorados), ...Object.entries(counts.avisos)].map(([reason, count], index) => (
                    <li key={`${entity}-${index}`}>{entity} · {reason} ({count})</li>
                  ))
                ))}
                {report.naoImportado.map((line) => <li key={line}>{line}</li>)}
                {report.usuariosSemVinculo > 0 ? <li>{report.usuariosSemVinculo} usuários do Astrea sem vínculo na equipe.</li> : null}
              </ul>
            </details>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
