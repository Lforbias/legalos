"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { renameDepartmentAction } from "./actions";

export function DepartmentName({ id, name, area }: { id: string; name: string; area: string }) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const router = useRouter();
  return <form className="space-y-2 rounded-lg border border-border p-4" onSubmit={e => {
    e.preventDefault(); setError(undefined);
    start(async () => { const res = await renameDepartmentAction(id, value); if (!res.ok) setError(res.message); else router.refresh(); });
  }}>
    <label htmlFor={`dep-${id}`} className="text-sm font-medium">Área: {area}</label>
    <div className="flex gap-2"><Input id={`dep-${id}`} value={value} onChange={e => setValue(e.target.value)} required minLength={2} maxLength={80} disabled={pending} /><Button type="submit" loading={pending}>Salvar nome</Button></div>
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
  </form>;
}
