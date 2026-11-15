/**
 * Registry de adaptadores de tribunal.
 *
 * Cada motor registra seu adaptador aqui. O runner resolve pelo `system`
 * do PortalAccess e delega. Novos motores (eproc, e-SAJ, PROJUDI)
 * precisam apenas implementar TribunalAdapter e chamar registerAdapter().
 *
 * IMPORTANTE: registrar um adaptador não significa habilitar todos os tribunais.
 * Cada adaptador declara seus `supportedTargets` — só esses podem ser usados.
 */

import type { TribunalAdapter, CourtTarget } from "./adapter";

const adapters = new Map<string, TribunalAdapter>();

export function registerAdapter(adapter: TribunalAdapter): void {
  const { key } = adapter.descriptor;
  if (adapters.has(key)) {
    throw new Error(`Adaptador "${key}" já registrado. Cada motor deve ter uma única instância.`);
  }
  adapters.set(key, adapter);
}

export function getAdapter(key: string): TribunalAdapter | null {
  return adapters.get(key) ?? null;
}

export function listAdapters(): TribunalAdapter[] {
  return [...adapters.values()];
}

export function findAdapterForCourt(courtCode: string, degree?: string): TribunalAdapter | null {
  for (const adapter of adapters.values()) {
    const match = adapter.descriptor.supportedTargets.find(
      (t) => t.courtCode === courtCode && (!degree || t.degree === degree),
    );
    if (match) return adapter;
  }
  return null;
}

export function getTargetsForAdapter(adapterKey: string): readonly CourtTarget[] {
  return adapters.get(adapterKey)?.descriptor.supportedTargets ?? [];
}

export function allSupportedTargets(): { adapter: TribunalAdapter; target: CourtTarget }[] {
  const result: { adapter: TribunalAdapter; target: CourtTarget }[] = [];
  for (const adapter of adapters.values()) {
    for (const target of adapter.descriptor.supportedTargets) {
      result.push({ adapter, target });
    }
  }
  return result;
}
