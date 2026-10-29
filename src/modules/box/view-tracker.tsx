"use client";

import { useEffect } from "react";
import { recordNoticeViewedAction } from "./actions";

/** Já registradas nesta aba: a ação é idempotente no servidor, mas assim evitamos chamadas repetidas. */
const sent = new Set<string>();

/**
 * Marca "vista no LegalOS" quando a pessoa realmente abre a comunicação (efeito no navegador: pré-carregamento de link
 * e robôs não contam). Não tem nenhum efeito no tribunal.
 */
export function ViewTracker({ noticeId }: { noticeId: string }) {
  useEffect(() => {
    if (sent.has(noticeId)) return;
    sent.add(noticeId);
    void recordNoticeViewedAction(noticeId).then((r) => {
      if (!r.ok) sent.delete(noticeId);
    });
  }, [noticeId]);
  return null;
}
