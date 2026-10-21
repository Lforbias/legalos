import type * as React from "react";

/** Fundo translúcido + borda na cor da etiqueta: o texto continua na cor normal do tema (contraste garantido). */
export function labelStyle(color: string): React.CSSProperties {
  return { backgroundColor: `${color}26`, borderColor: color };
}
