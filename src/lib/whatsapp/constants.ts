export const WINDOW_MS = 24 * 3600 * 1000;
export const MAX_TEXT = 4096;
export const AWAY_COOLDOWN_MS = 12 * 3600 * 1000;
export const TYPE_LABEL: Record<string, string> = { image: "Imagem", document: "Documento", audio: "Áudio", video: "Vídeo", sticker: "Figurinha", location: "Localização", template: "Modelo", unknown: "Mensagem não suportada" };

export const isWindowOpen = (lastInboundAt: Date | null, now = new Date()) => !!lastInboundAt && now.getTime() - lastInboundAt.getTime() < WINDOW_MS;
export const windowClosesAt = (lastInboundAt: Date | null) => (lastInboundAt ? new Date(lastInboundAt.getTime() + WINDOW_MS) : null);
