/** Protótipos de tela (só visual, dados de exemplo; nada é gravado nem enviado). Ver docs/prototipos.md. */
export type Field = { label: string; kind?: "text" | "select" | "textarea" | "date" | "toggle" | "password"; value?: string; hint?: string; options?: string[]; on?: boolean };
export type Block =
  | { t: "stats"; items: { label: string; value: string; hint?: string }[] }
  | { t: "table"; title: string; description?: string; cols: string[]; rows: string[][]; filters?: string[]; actions?: string[] }
  | { t: "kanban"; title: string; description?: string; cols: { name: string; cards: { title: string; meta?: string; tag?: string }[] }[] }
  | { t: "form"; title: string; description?: string; fields: Field[]; actions?: string[] }
  | { t: "toggles"; title: string; description?: string; items: { label: string; hint?: string; on?: boolean }[] }
  | { t: "steps"; title: string; steps: { title: string; text: string }[] }
  | { t: "note"; text: string };

export type Proto = { id: string; version: "2.0" | "3.0" | "4.0"; space: "Func" | "Box" | "Chat"; title: string; summary: string; blocks: Block[] };
