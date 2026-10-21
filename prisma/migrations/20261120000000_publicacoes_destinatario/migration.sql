-- 2.0-F1: quem recebe as publicações de cada monitoramento (um membro OU uma equipe; vazio = Entrada)
ALTER TABLE "djen_monitors" ADD COLUMN "default_assignee_id" UUID;
ALTER TABLE "djen_monitors" ADD COLUMN "default_team_id" UUID;
ALTER TABLE "djen_monitors" ADD CONSTRAINT "djen_monitors_one_recipient" CHECK ("default_assignee_id" IS NULL OR "default_team_id" IS NULL);
