/** Product decision: the judicial capture and filing module has been removed.
 * Routes remain blocked while the removal migration clears its data.
 */
export const BOX_AVAILABLE: boolean = false;
export const BOX_UNAVAILABLE_MESSAGE = "O módulo judicial de captura e protocolo foi removido do LegalOS.";
const prefixes = ["/box", "/box-v3", "/caixa-de-entrada", "/peticoes", "/certificados", "/monitoramento", "/integracoes/pje", "/configuracoes/tribunais", "/configuracoes/credenciais", "/produto/box", "/api/box", "/api/certificates", "/api/petitions", "/api/v1/pje", "/api/v1/portal/notices", "/api/v1/notices", "/api/webhooks/legalmail", "/api/cron/mni", "/api/cron/robots", "/api/cron/petition-queue", "/api/cron/autos-queue", "/api/cron/monitoring", "/api/cron/djen", "/downloads/legalos-pje.zip"];
const boxPathname = (path: string) => prefixes.some(p => path === p || path.startsWith(`${p}/`)) || /^\/modulos\/(?:box[^/]*|inbox|petitions|certificates|pje-connect|monitoring)(?:\/|$)/.test(path) || /^\/processos\/[^/]+\/autos(?:\/|$)/.test(path);
export const isBoxPermission = (permission: string) => /^(?:inbox|petitions|certificates):/.test(permission);
export const isBoxEvent = (event: string) => event === "notice.created" || event.startsWith("petition.");
export const isBoxTool = (name: string) => /(?:intimac|publicac|petic|certificad|djen|mni|pje|autos|tribunal|credencial)/i.test(name);

export const isBoxPath = (raw: string) => boxPathname(raw.split(/[?#]/)[0] ?? raw);
