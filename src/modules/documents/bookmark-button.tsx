"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bookmarkAction } from "./autos-actions";
export function BookmarkButton({ id, favorite }: { id: string; favorite: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const router = useRouter();
  return <span><button type="button" disabled={pending} aria-pressed={favorite} aria-label={favorite ? "Remover favorito" : "Favoritar documento"} onClick={() => start(async () => {
    const r = await bookmarkAction(id, !favorite);
    setError(r.ok ? "" : r.message ?? "Não foi possível salvar.");
    if (r.ok) router.refresh();
  })} className="rounded border border-border px-2 py-1 text-sm">{favorite ? "★" : "☆"}</button>{error ? <span role="alert" className="text-xs text-danger">{error}</span> : null}</span>;
}
