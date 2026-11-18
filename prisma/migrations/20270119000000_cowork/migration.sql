-- LegalOS Cowork: ambiente colaborativo interno (canais, mensagens, reuniões e vínculos de trabalho).
-- Migração aditiva: só cria tabelas/tipos novos e acrescenta permissões aos perfis do sistema.

-- CreateEnum
CREATE TYPE "CoworkChannelKind" AS ENUM ('CHANNEL', 'DIRECT', 'GROUP');

-- CreateEnum
CREATE TYPE "CoworkVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "CoworkMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "CoworkAuthorKind" AS ENUM ('HUMAN', 'SYSTEM', 'AGENT');

-- CreateEnum
CREATE TYPE "CoworkResourceKind" AS ENUM ('CLIENT', 'CASE', 'DOCUMENT', 'FOLDER', 'TASK', 'DEADLINE', 'EVENT', 'MEETING');

-- CreateEnum
CREATE TYPE "CoworkMeetingStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'ENDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "CoworkRsvp" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "CoworkAttendance" AS ENUM ('UNKNOWN', 'PRESENT', 'ABSENT');

-- CreateEnum
CREATE TYPE "CoworkWorkPurpose" AS ENUM ('TASK', 'ACTIVITY', 'FORWARD', 'APPOINTMENT', 'REVIEW', 'PENDING');

-- CreateEnum
CREATE TYPE "CoworkAvailability" AS ENUM ('AVAILABLE', 'BUSY', 'AWAY');

-- CreateTable
CREATE TABLE "cowork_settings" (
    "organization_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "default_channels" TEXT[] DEFAULT ARRAY['juridico', 'atendimento', 'comercial', 'financeiro', 'administracao']::TEXT[],
    "allow_direct" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cowork_settings_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "cowork_member_profiles" (
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "display_name" TEXT,
    "job_title" TEXT,
    "department" TEXT,
    "availability" "CoworkAvailability",
    "availability_note" TEXT,
    "availability_at" TIMESTAMPTZ(3),
    "blocked_at" TIMESTAMPTZ(3),
    "blocked_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cowork_member_profiles_pkey" PRIMARY KEY ("organization_id","user_id")
);

-- CreateTable
CREATE TABLE "cowork_channels" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "kind" "CoworkChannelKind" NOT NULL DEFAULT 'CHANNEL',
    "visibility" "CoworkVisibility" NOT NULL DEFAULT 'PUBLIC',
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "topic" TEXT,
    "department" TEXT,
    "case_id" UUID,
    "auto_join" BOOLEAN NOT NULL DEFAULT false,
    "direct_key" TEXT,
    "last_seq" INTEGER NOT NULL DEFAULT 0,
    "last_message_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "archived_by_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cowork_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cowork_channel_members" (
    "channel_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "CoworkMemberRole" NOT NULL DEFAULT 'MEMBER',
    "last_read_seq" INTEGER NOT NULL DEFAULT 0,
    "muted_at" TIMESTAMPTZ(3),
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cowork_channel_members_pkey" PRIMARY KEY ("channel_id","user_id")
);

-- CreateTable
CREATE TABLE "cowork_messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "author_id" UUID,
    "author_kind" "CoworkAuthorKind" NOT NULL DEFAULT 'HUMAN',
    "agent_key" TEXT,
    "parent_id" UUID,
    "body" TEXT NOT NULL,
    "mentioned_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "client_nonce" TEXT,
    "reply_count" INTEGER NOT NULL DEFAULT 0,
    "last_reply_at" TIMESTAMPTZ(3),
    "edited_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cowork_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cowork_attachments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "cowork_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cowork_resource_refs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "kind" "CoworkResourceKind" NOT NULL,
    "resource_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cowork_resource_refs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cowork_meetings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "channel_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3),
    "status" "CoworkMeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "host_id" UUID NOT NULL,
    "case_id" UUID,
    "task_id" UUID,
    "agenda_event_id" UUID,
    "minutes" TEXT,
    "decisions" TEXT,
    "minutes_by_id" UUID,
    "minutes_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "ended_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "request_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cowork_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cowork_meeting_participants" (
    "meeting_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_host" BOOLEAN NOT NULL DEFAULT false,
    "rsvp" "CoworkRsvp" NOT NULL DEFAULT 'PENDING',
    "responded_at" TIMESTAMPTZ(3),
    "attendance" "CoworkAttendance" NOT NULL DEFAULT 'UNKNOWN',
    "attendance_by_id" UUID,

    CONSTRAINT "cowork_meeting_participants_pkey" PRIMARY KEY ("meeting_id","user_id")
);

-- CreateTable
CREATE TABLE "cowork_work_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "purpose" "CoworkWorkPurpose" NOT NULL,
    "channel_id" UUID,
    "message_id" UUID,
    "meeting_id" UUID,
    "task_id" UUID,
    "agenda_event_id" UUID,
    "department" TEXT,
    "created_by_id" UUID,
    "request_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cowork_work_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cowork_channels_organization_id_kind_archived_at_idx" ON "cowork_channels"("organization_id", "kind", "archived_at");

-- CreateIndex
CREATE INDEX "cowork_channels_case_id_idx" ON "cowork_channels"("case_id");

-- CreateIndex
CREATE UNIQUE INDEX "cowork_channels_id_organization_id_key" ON "cowork_channels"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "cowork_channels_organization_id_slug_key" ON "cowork_channels"("organization_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "cowork_channels_organization_id_direct_key_key" ON "cowork_channels"("organization_id", "direct_key");

-- CreateIndex
CREATE INDEX "cowork_channel_members_organization_id_user_id_idx" ON "cowork_channel_members"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "cowork_messages_organization_id_created_at_idx" ON "cowork_messages"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "cowork_messages_parent_id_seq_idx" ON "cowork_messages"("parent_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "cowork_messages_id_organization_id_key" ON "cowork_messages"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "cowork_messages_channel_id_seq_key" ON "cowork_messages"("channel_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "cowork_messages_channel_id_author_id_client_nonce_key" ON "cowork_messages"("channel_id", "author_id", "client_nonce");

-- CreateIndex
CREATE UNIQUE INDEX "cowork_attachments_storage_key_key" ON "cowork_attachments"("storage_key");

-- CreateIndex
CREATE INDEX "cowork_attachments_message_id_idx" ON "cowork_attachments"("message_id");

-- CreateIndex
CREATE INDEX "cowork_attachments_organization_id_channel_id_idx" ON "cowork_attachments"("organization_id", "channel_id");

-- CreateIndex
CREATE INDEX "cowork_resource_refs_organization_id_kind_resource_id_idx" ON "cowork_resource_refs"("organization_id", "kind", "resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "cowork_resource_refs_message_id_kind_resource_id_key" ON "cowork_resource_refs"("message_id", "kind", "resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "cowork_meetings_agenda_event_id_key" ON "cowork_meetings"("agenda_event_id");

-- CreateIndex
CREATE INDEX "cowork_meetings_organization_id_starts_at_idx" ON "cowork_meetings"("organization_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "cowork_meetings_id_organization_id_key" ON "cowork_meetings"("id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "cowork_meetings_organization_id_request_key_key" ON "cowork_meetings"("organization_id", "request_key");

-- CreateIndex
CREATE INDEX "cowork_meeting_participants_organization_id_user_id_idx" ON "cowork_meeting_participants"("organization_id", "user_id");

-- CreateIndex
CREATE INDEX "cowork_work_items_organization_id_created_at_idx" ON "cowork_work_items"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "cowork_work_items_message_id_idx" ON "cowork_work_items"("message_id");

-- CreateIndex
CREATE INDEX "cowork_work_items_meeting_id_idx" ON "cowork_work_items"("meeting_id");

-- CreateIndex
CREATE INDEX "cowork_work_items_task_id_idx" ON "cowork_work_items"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "cowork_work_items_organization_id_request_key_key" ON "cowork_work_items"("organization_id", "request_key");

-- AddForeignKey
ALTER TABLE "cowork_settings" ADD CONSTRAINT "cowork_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cowork_member_profiles" ADD CONSTRAINT "cowork_member_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cowork_member_profiles" ADD CONSTRAINT "cowork_member_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cowork_channels" ADD CONSTRAINT "cowork_channels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cowork_channels" ADD CONSTRAINT "cowork_channels_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cowork_channel_members" ADD CONSTRAINT "cowork_channel_members_channel_id_organization_id_fkey" FOREIGN KEY ("channel_id", "organization_id") REFERENCES "cowork_channels"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cowork_channel_members" ADD CONSTRAINT "cowork_channel_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cowork_messages" ADD CONSTRAINT "cowork_messages_channel_id_organization_id_fkey" FOREIGN KEY ("channel_id", "organization_id") REFERENCES "cowork_channels"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cowork_messages" ADD CONSTRAINT "cowork_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cowork_messages" ADD CONSTRAINT "cowork_messages_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "cowork_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cowork_attachments" ADD CONSTRAINT "cowork_attachments_channel_id_organization_id_fkey" FOREIGN KEY ("channel_id", "organization_id") REFERENCES "cowork_channels"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cowork_attachments" ADD CONSTRAINT "cowork_attachments_message_id_organization_id_fkey" FOREIGN KEY ("message_id", "organization_id") REFERENCES "cowork_messages"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cowork_resource_refs" ADD CONSTRAINT "cowork_resource_refs_message_id_organization_id_fkey" FOREIGN KEY ("message_id", "organization_id") REFERENCES "cowork_messages"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cowork_meetings" ADD CONSTRAINT "cowork_meetings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cowork_meetings" ADD CONSTRAINT "cowork_meetings_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "cowork_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cowork_meetings" ADD CONSTRAINT "cowork_meetings_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cowork_meeting_participants" ADD CONSTRAINT "cowork_meeting_participants_meeting_id_organization_id_fkey" FOREIGN KEY ("meeting_id", "organization_id") REFERENCES "cowork_meetings"("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cowork_meeting_participants" ADD CONSTRAINT "cowork_meeting_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cowork_work_items" ADD CONSTRAINT "cowork_work_items_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "cowork_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cowork_work_items" ADD CONSTRAINT "cowork_work_items_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "cowork_meetings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cowork_work_items" ADD CONSTRAINT "cowork_work_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Permissões do Cowork nos perfis do sistema (perfis personalizados ficam como estão: o administrador decide).
UPDATE roles SET permissions = permissions || ARRAY['cowork:read','cowork:write','cowork:channels','cowork:members','cowork:share','cowork:meetings','cowork:insights','cowork:manage']
 WHERE is_system AND key IN ('OWNER', 'ADMIN') AND NOT ('cowork:read' = ANY(permissions));
UPDATE roles SET permissions = permissions || ARRAY['cowork:read','cowork:write','cowork:channels','cowork:share','cowork:meetings','cowork:insights']
 WHERE is_system AND key = 'CONTROLLER' AND NOT ('cowork:read' = ANY(permissions));
UPDATE roles SET permissions = permissions || ARRAY['cowork:read','cowork:write','cowork:channels','cowork:share','cowork:meetings']
 WHERE is_system AND key = 'LAWYER' AND NOT ('cowork:read' = ANY(permissions));
UPDATE roles SET permissions = permissions || ARRAY['cowork:read','cowork:write','cowork:share','cowork:meetings']
 WHERE is_system AND key IN ('FINANCE', 'ASSISTANT') AND NOT ('cowork:read' = ANY(permissions));
