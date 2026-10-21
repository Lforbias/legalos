const COLORS = ["#2563eb", "#7c3aed", "#db2777", "#ea580c", "#0d9488", "#65a30d", "#0891b2", "#b45309", "#4f46e5", "#be123c"];

export function initialsOf(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "#";
  return ((parts[0]![0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : "")).toUpperCase();
}

/** Círculo com as iniciais; a cor vem do nome, para a mesma pessoa ter sempre a mesma cor. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span aria-hidden className="inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white" style={{ width: size, height: size, background: COLORS[h % COLORS.length], fontSize: Math.round(size * 0.38) }}>
      {initialsOf(name)}
    </span>
  );
}
