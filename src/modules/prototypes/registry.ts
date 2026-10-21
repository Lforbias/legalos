import { PROTOS_2 } from "./phases-2";
import { PROTOS_3 } from "./phases-3";
import { PROTOS_4 } from "./phases-4";
import type { Proto } from "./types";

export const PROTOTYPES: Proto[] = [...PROTOS_2, ...PROTOS_3, ...PROTOS_4];
export const getPrototype = (id: string) => PROTOTYPES.find((p) => p.id === id);
/** Protótipos só aparecem quando LEGALOS_PROTOTYPES=1 no ambiente do servidor (desligado por padrão). */
export const prototypesEnabled = () => process.env.LEGALOS_PROTOTYPES === "1";
