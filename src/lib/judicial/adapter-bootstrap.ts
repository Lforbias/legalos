/**
 * Bootstrap dos adaptadores de tribunal.
 *
 * Importar este módulo registra todos os adaptadores disponíveis.
 * Chamado uma vez na inicialização do servidor ou do worker.
 *
 * Para adicionar um novo motor:
 *  1. Crie src/lib/robots/<motor>/<motor>-adapter.ts implementando TribunalAdapter.
 *  2. Importe e registre aqui.
 *  3. Os targets do adaptador aparecem automaticamente no catálogo e na UI.
 */

import { registerAdapter, listAdapters } from "./adapter-registry";
import { pjeAdapter } from "@/lib/robots/pje/pje-adapter";

let initialized = false;

export function bootstrapAdapters(): void {
  if (initialized) return;
  initialized = true;

  registerAdapter(pjeAdapter);

  // Futuros adaptadores:
  // registerAdapter(eprocAdapter);
  // registerAdapter(esajAdapter);
  // registerAdapter(projudiAdapter);
}

export function ensureAdapters(): void {
  if (!initialized) bootstrapAdapters();
}

export { listAdapters, getAdapter, findAdapterForCourt, allSupportedTargets } from "./adapter-registry";
