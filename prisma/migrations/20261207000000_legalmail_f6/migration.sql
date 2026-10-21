-- 3.0-F6: qual sistema de tribunal atende cada tribunal (J.TR) em cada escritório.
CREATE TABLE "court_system_maps" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "jtr" TEXT NOT NULL,
  "system" TEXT NOT NULL,
  "set_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "court_system_maps_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "court_system_maps_org_jtr_key" ON "court_system_maps"("organization_id", "jtr");
ALTER TABLE "court_system_maps" ADD CONSTRAINT "court_system_maps_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
