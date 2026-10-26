"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { createFromCnpjAction, createProspectAction } from "./actions";
import { useRun } from "./use-run";

export function NewProspect() {
  const router = useRouter();
  const { run, pending, error } = useRun();
  const [cnpj, setCnpj] = React.useState("");
  const [name, setName] = React.useState("");
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => createFromCnpjAction(cnpj), (d) => d && router.push(`/comercial/escritorios/${d.id}`)); }}>
        <Field label="Adicionar pelo CNPJ" htmlFor="np-cnpj" hint="Busca razão social, telefone, e-mail, endereço e sócios na base pública da Receita e já tenta achar o ponto no mapa.">
          <Input id="np-cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" inputMode="text" />
        </Field>
        <Button type="submit" loading={pending} disabled={cnpj.trim().length < 11}>Buscar e adicionar</Button>
      </form>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run(() => createProspectAction({ name, city: "São Paulo", state: "SP" }), (d) => d && router.push(`/comercial/escritorios/${d.id}`)); }}>
        <Field label="Ou adicionar só com o nome" htmlFor="np-name" hint="Complete os dados na página do escritório.">
          <Input id="np-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do escritório" />
        </Field>
        <Button type="submit" variant="secondary" loading={pending} disabled={name.trim().length < 2}>Adicionar</Button>
      </form>
      {error ? <div className="md:col-span-2"><Alert tone="error">{error}</Alert></div> : null}
    </div>
  );
}
