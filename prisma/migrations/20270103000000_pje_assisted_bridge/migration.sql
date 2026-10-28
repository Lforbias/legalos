CREATE TABLE court_otp_authenticators (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, label TEXT NOT NULL, secret_enc TEXT NOT NULL,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(), revoked_at TIMESTAMPTZ(3)
);
CREATE INDEX court_otp_owner_idx ON court_otp_authenticators(organization_id, user_id);
CREATE TABLE pje_discoveries (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, number TEXT NOT NULL, source_origin TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','LINKED','IGNORED')),
 case_id UUID REFERENCES cases(id) ON DELETE SET NULL, created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 UNIQUE(organization_id, user_id, number)
);
CREATE INDEX pje_discovery_owner_idx ON pje_discoveries(organization_id, user_id, status);
