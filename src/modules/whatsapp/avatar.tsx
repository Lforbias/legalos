"use client";

import { useState } from "react";

const COLORS = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#0d9488", "#65a30d", "#0891b2", "#b45309", "#4f46e5", "#be123c"];

export function initialsOf(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "#";
  return ((parts[0]![0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : "")).toUpperCase();
}

/** Círculo com as iniciais; a cor vem do nome, para a mesma pessoa ter sempre a mesma cor. */
export function Avatar({ name, size = 40, conversationId }: { name: string; size?: number; conversationId?: string }) {
  const [failedId, setFailedId] = useState<string>();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span aria-hidden className="relative inline-flex shrink-0 select-none overflow-hidden items-center justify-center rounded-full font-semibold text-white" style={{ width: size, height: size, background: COLORS[h % COLORS.length], fontSize: Math.round(size * 0.38) }}>
      {initialsOf(name)}
      {conversationId && failedId !== conversationId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" loading="lazy" src={`/api/whatsapp/conversations/${conversationId}/avatar`} className="absolute inset-0 size-full object-cover" onError={() => setFailedId(conversationId)} />
      ) : null}
    </span>
  );
}
