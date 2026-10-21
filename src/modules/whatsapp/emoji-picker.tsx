"use client";

import * as React from "react";

const EMOJIS = ["😀", "😊", "😂", "🙂", "😉", "😍", "🥰", "😘", "🤗", "🤔", "😅", "😢", "😭", "😡", "🙏", "👍", "👏", "💪", "🤝", "👋", "✅", "❌", "⚠️", "📌", "📎", "📄", "📅", "⏰", "📞", "💬", "🏛️", "⚖️", "💰", "🧾", "✔️", "❤️", "🎉", "🌟", "☀️", "🌙"];

/** Seletor de emojis simples: abre por clique, fecha com Esc ou clique fora. */
export function EmojiPicker({ onPick, disabled }: { onPick: (e: string) => void; disabled?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label="Emojis" aria-expanded={open} disabled={disabled} onClick={() => setOpen(!open)} className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-muted hover:bg-surface-2 disabled:opacity-50">🙂</button>
      {open ? (
        <div role="dialog" aria-label="Escolher emoji" className="absolute bottom-11 left-0 z-20 grid w-64 grid-cols-8 gap-1 rounded-lg border border-border bg-surface p-2 shadow-lg" data-testid="emoji-grid">
          {EMOJIS.map((e) => <button key={e} type="button" className="rounded p-1 text-lg hover:bg-surface-2" onClick={() => { onPick(e); setOpen(false); }}>{e}</button>)}
        </div>
      ) : null}
    </div>
  );
}
