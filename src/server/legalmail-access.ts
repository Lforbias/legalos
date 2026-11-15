import type { TenantContext } from "@/server/context";

/** Compatibilidade para telas antigas: a ingestão de publicações foi retirada. */
export async function legalMailOfficeId(): Promise<string | null> { return null; }

export async function isLegalMailOffice(_organizationId: string): Promise<boolean> { return false; }

export async function canImportLegalMail(_ctx: TenantContext): Promise<boolean> { return false; }

export async function canReadLegalMailInFunc(_ctx: TenantContext): Promise<boolean> { return false; }
