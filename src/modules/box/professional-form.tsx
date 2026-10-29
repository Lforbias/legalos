"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { addProfessionalAction } from "./actions";

/** Cadastro de advogado + OAB. Valida duplicidade no servidor (mesma OAB e UF no escritório = mesma pessoa). */
export function ProfessionalForm({ ufs, defaultUf = "BA", submitLabel = "Cadastrar advogado", onAdded }: { ufs: string[]; defaultUf?: string; submitLabel?: string; onAdded?: (id: string) => void }) {
  const router = useRouter();
  const [f, setF] = React.useState({ name: "", oabNumber: "", oabUf: defaultUf, notifyEmail: "" });
  const [errors, setErrors] = React.useState<Record<string, string | undefined>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [pending, start] = React.useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <form
      className="space-y-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setDone(false);
          setError(null);
          setErrors({});
          const r = await addProfessionalAction(f);
          if (!r.ok) {
            setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0]])));
            if (!r.fieldErrors || Object.keys(r.fieldErrors).length === 0) setError(r.message ?? "Não foi possível cadastrar.");
            return;
          }
          setDone(true);
          setF((p) => ({ ...p, name: "", oabNumber: "", notifyEmail: "" }));
          if (r.data) onAdded?.(r.data.id);
          router.refresh();
        });
      }}
    >
      {error ? <Alert tone="error">{error}</Alert> : null}
      {done ? <Alert tone="success">Advogado cadastrado.</Alert> : null}
      <Field label="Nome do advogado" htmlFor="prof-name" error={errors.name}>
        <Input id="prof-name" autoComplete="off" value={f.name} onChange={set("name")} aria-invalid={Boolean(errors.name)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <Field label="Número da OAB" htmlFor="prof-oab" error={errors.oabNumber} hint="Somente o número, sem pontos.">
          <Input id="prof-oab" inputMode="numeric" autoComplete="off" value={f.oabNumber} onChange={set("oabNumber")} aria-invalid={Boolean(errors.oabNumber)} />
        </Field>
        <Field label="Seccional (UF)" htmlFor="prof-uf" error={errors.oabUf}>
          <Select id="prof-uf" value={f.oabUf} onChange={set("oabUf")}>
            {ufs.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="E-mail para avisos (opcional)" htmlFor="prof-email" error={errors.notifyEmail} hint="Para onde o LegalOS avisa sobre publicações e problemas deste advogado.">
        <Input id="prof-email" type="email" autoComplete="off" value={f.notifyEmail} onChange={set("notifyEmail")} aria-invalid={Boolean(errors.notifyEmail)} />
      </Field>
      <Button type="submit" loading={pending}>{submitLabel}</Button>
    </form>
  );
}
