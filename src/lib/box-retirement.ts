/** Product decision: the old Box is withdrawn pending a new implementation.
 * No environment flag (including LEGALOS_BOX_V2) may reactivate it.
 * Historical rows and certificate vault material are preserved, never erased here.
 */
export const BOX_AVAILABLE: boolean = false;
export const BOX_UNAVAILABLE_MESSAGE = "O LegalOS Box foi retirado temporariamente para reconstrução.";
const prefixes = ["/box", "/caixa-de-entrada", "/peticoes", "/certificados", "/monitoramento", "/integracoes/pje", "/configuracoes/tribunais", "/configuracoes/credenciais", "/produto/box", "/api/box", "/api/certificates", "/api/petitions", "/api/v1/pje", "/api/v1/portal/notices", "/api/v1/notices", "/api/cron/djen", "/api/cron/mni", "/api/cron/robots", "/api/cron/petition-queue", "/api/cron/autos-queue", "/api/cron/monitoring", "/downloads/legalos-pje.zip"];
const boxPathname = (path: string) => prefixes.some(p => path === p || path.startsWith(`${p}/`)) || /^\/modulos\/(?:box[^/]*|inbox|petitions|certificates|pje-connect|monitoring)(?:\/|$)/.test(path) || /^\/processos\/[^/]+\/autos(?:\/|$)/.test(path);
export const isBoxPermission = (permission: string) => /^(?:inbox|petitions|certificates):/.test(permission);
export const isBoxEvent = (event: string) => event === "notice.created" || event.startsWith("petition.");
export const isBoxTool = (name: string) => /(?:intimac|publicac|petic|certificad|datajud|djen|mni|pje|autos|tribunal|credencial)/i.test(name);

export const isBoxPath = (raw: string) => boxPathname(raw.split(/[?#]/)[0] ?? raw);
