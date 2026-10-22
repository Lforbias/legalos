-- 2.0-F11: cofre de credenciais de clientes + permissões novas (só Proprietário e Administrador por padrão).
CREATE TABLE "client_credentials" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "client_id" UUID NOT NULL,
  "system" TEXT NOT NULL, "label" TEXT NOT NULL, "secret_enc" TEXT NOT NULL,
  "created_by_id" UUID, "updated_by_id" UUID, "last_revealed_at" TIMESTAMPTZ(3), "last_revealed_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_credentials_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "client_credentials_organization_id_client_id_idx" ON "client_credentials"("organization_id", "client_id");
ALTER TABLE "client_credentials" ADD CONSTRAINT "client_credentials_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_credentials" ADD CONSTRAINT "client_credentials_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE roles SET permissions = permissions || ARRAY['vault:manage', 'vault:read']
 WHERE is_system AND key IN ('OWNER', 'ADMIN') AND NOT ('vault:read' = ANY(permissions));
