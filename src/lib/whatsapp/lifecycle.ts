export const SERVICE_STATUSES = ["OPEN", "IN_SERVICE", "WAITING", "RESOLVED", "CLOSED", "UNDEFINED"] as const;
export type ServiceStatus = typeof SERVICE_STATUSES[number];
export const SERVICE_STATUS_LABEL: Record<ServiceStatus, string> = { OPEN: "Aberto", IN_SERVICE: "Em atendimento", WAITING: "Aguardando", RESOLVED: "Resolvido", CLOSED: "Fechado", UNDEFINED: "Indefinido" };
export const isClosedService = (s: string) => s === "RESOLVED" || s === "CLOSED";
export function inboundTransition(c: {
    status: string;
    serviceStatus: string;
    closedAt: Date | null;
    lastMessageAt: Date | null;
}, a: {
    autoStatusEnabled: boolean;
    reopenAfterMinutes: number;
    reassignOnReopen: boolean;
}, at: Date) {
    const wasClosed = c.status === "CLOSED" || isClosedService(c.serviceStatus);
    const since = c.closedAt ?? c.lastMessageAt;
    const reassign = a.autoStatusEnabled && a.reassignOnReopen && wasClosed && (!since || at.getTime() - since.getTime() >= a.reopenAfterMinutes * 60000);
    const serviceStatus = !a.autoStatusEnabled ? (wasClosed ? "OPEN" : c.serviceStatus) : wasClosed || c.serviceStatus === "UNDEFINED" ? "OPEN" : c.serviceStatus === "WAITING" ? "IN_SERVICE" : c.serviceStatus;
    return { serviceStatus, status: "OPEN" as const, closedAt: null, reassign };
}
