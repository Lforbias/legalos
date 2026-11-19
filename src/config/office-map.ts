import { DEPARTMENTS, departmentItems, type Department } from "@/config/evolution-navigation";

/**
 * "Mapa do escritório": a ordem e as cores das áreas usadas no site público e no Lobby.
 * Os nomes, resumos e cores vêm do menu Evolution, para o site nunca mostrar um módulo que não existe.
 */
export const OFFICE_AREAS: Department[] = ["mesa", "juridico", "atendimento", "comercial", "financeiro", "administracao"];

export const COWORK_AREA = {
  name: "Cowork",
  color: "#7C8CFF",
  href: "/cowork",
  summary: "Canais, conversas e reuniões da equipe, com uma sala para cada processo.",
} as const;

/** Rótulos dos itens do menu de cada área (sem a visão geral da área), sem repetir. */
export function areaItemLabels(dept: Department, limit = 4): string[] {
  return [...new Set(departmentItems(dept).map((i) => i.label))].slice(0, limit);
}

export function areaInfo(dept: Department) {
  return DEPARTMENTS[dept];
}
