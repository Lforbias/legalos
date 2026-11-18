import type { ChannelSummary } from "@/server/services/cowork-channel.service";
import type { CoworkMessageDTO } from "@/server/services/cowork-message.service";
import type { CoworkPerson } from "@/server/services/cowork-access.service";
import type { ResourceCard } from "@/server/services/cowork-resource.service";
import type { WorkState } from "./constants";

export type { ChannelSummary, CoworkMessageDTO, ResourceCard };
export type Person = CoworkPerson & { workState: WorkState };

export type CoworkPerms = {
  write: boolean;
  channels: boolean;
  share: boolean;
  meetings: boolean;
  insights: boolean;
  manage: boolean;
  members: boolean;
  /** Pode criar tarefas (módulo de tarefas) ou compromissos (agenda) a partir de mensagens. */
  tasksWrite: boolean;
  agendaWrite: boolean;
  casesRead: boolean;
  allowDirect: boolean;
};

export type PendingMessage = {
  nonce: string;
  channelId: string;
  parentId: string | null;
  body: string;
  files: File[];
  resources: { kind: string; resourceId: string; title: string }[];
  mentionedIds: string[];
  status: "sending" | "failed";
  error?: string;
  createdAt: string;
};
