ALTER TABLE "court_connections"
 ADD COLUMN "auth_profile" TEXT NOT NULL DEFAULT 'STATIC',
 ADD COLUMN "system" TEXT NOT NULL DEFAULT 'pje-mni',
 ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'UNSPECIFIED',
 ADD COLUMN "wsdl_url" TEXT,
 ADD COLUMN "wsdl_actions" JSONB NOT NULL DEFAULT '{}',
 ADD COLUMN "wsdl_status" TEXT,
 ADD COLUMN "wsdl_checked_at" TIMESTAMPTZ(3),
 ADD COLUMN "wsdl_operations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "cases" ADD COLUMN "court_system" TEXT;
CREATE INDEX "court_connections_organization_id_jtr_system_enabled_idx" ON "court_connections"("organization_id", "jtr", "system", "enabled");
