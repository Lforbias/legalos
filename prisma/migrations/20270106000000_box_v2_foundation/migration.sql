-- LegalOS Box 2.0 — base estrutural (ADITIVA: nada é apagado nem renomeado; o código antigo continua funcionando).
-- Rollback seguro: veja docs/box-v2-rollback.md (as colunas/tabelas novas podem ficar sem uso).

-- 1) Identidades profissionais (OAB). Vários profissionais e várias inscrições por escritório.
CREATE TABLE professional_identities (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 user_id UUID REFERENCES users(id) ON DELETE SET NULL,
 name TEXT NOT NULL,
 oab_number TEXT NOT NULL,
 oab_uf TEXT NOT NULL,
 notify_email TEXT,
 active BOOLEAN NOT NULL DEFAULT true,
 created_by_id UUID,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 UNIQUE (organization_id, oab_uf, oab_number)
);
CREATE INDEX professional_identities_org_idx ON professional_identities(organization_id, active);

-- Preserva o que já existe: cada monitoramento DJEN atual vira uma identidade profissional.
INSERT INTO professional_identities (organization_id, name, oab_number, oab_uf, created_by_id, created_at)
SELECT organization_id, label, oab_number, oab_uf, created_by_id, created_at FROM djen_monitors
ON CONFLICT (organization_id, oab_uf, oab_number) DO NOTHING;

-- 2) Execuções de sincronização (com checkpoint e trava de concorrência).
CREATE TABLE sync_runs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 source_kind TEXT NOT NULL CHECK (source_kind IN ('DJEN','MNI','PORTAL','DATAJUD')),
 source_id UUID NOT NULL,
 trigger TEXT NOT NULL DEFAULT 'CRON' CHECK (trigger IN ('CRON','MANUAL','ONBOARDING','RETRY')),
 status TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','SUCCEEDED','PARTIAL','FAILED','INTERRUPTED')),
 started_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 heartbeat_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 finished_at TIMESTAMPTZ(3),
 window_from DATE,
 window_to DATE,
 cursor JSONB,
 pages INTEGER NOT NULL DEFAULT 0,
 fetched INTEGER NOT NULL DEFAULT 0,
 reported_total INTEGER,
 created_count INTEGER NOT NULL DEFAULT 0,
 duplicate_count INTEGER NOT NULL DEFAULT 0,
 skipped_count INTEGER NOT NULL DEFAULT 0,
 error_code TEXT,
 error_message TEXT,
 coverage TEXT CHECK (coverage IN ('SERVICE_REACHABLE','AUTH_VALID','QUERY_COMPLETED','PARTIAL_SYNC','CAPTURE_PROVEN','NOT_VERIFIABLE'))
);
-- no máximo UMA execução em andamento por fonte (a própria trava)
CREATE UNIQUE INDEX sync_runs_one_running_uq ON sync_runs(source_kind, source_id) WHERE status = 'RUNNING';
CREATE INDEX sync_runs_source_idx ON sync_runs(organization_id, source_kind, source_id, started_at DESC);
CREATE INDEX sync_runs_status_idx ON sync_runs(status, heartbeat_at);

-- 3) Evidências de funcionamento por tribunal × operação × método (a única base para dizer "operacional").
CREATE TABLE connector_evidences (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
 source_kind TEXT,
 source_id UUID,
 connector_key TEXT NOT NULL,
 court_code TEXT NOT NULL DEFAULT '*',
 operation TEXT NOT NULL,
 access_method TEXT NOT NULL,
 environment TEXT NOT NULL DEFAULT 'PRODUCTION' CHECK (environment IN ('PRODUCTION','HOMOLOGATION','SIMULATED')),
 outcome TEXT NOT NULL CHECK (outcome IN ('PASSED','FAILED','INCONCLUSIVE')),
 reason_code TEXT,
 summary TEXT,
 details JSONB NOT NULL DEFAULT '{}',
 run_id UUID REFERENCES sync_runs(id) ON DELETE SET NULL,
 checked_by_id UUID,
 checked_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX connector_evidences_lookup_idx ON connector_evidences(organization_id, connector_key, court_code, operation, checked_at DESC);
CREATE INDEX connector_evidences_source_idx ON connector_evidences(source_kind, source_id, checked_at DESC);

-- 4) Alertas de saúde (persistentes, com ciclo de vida e deduplicação).
CREATE TABLE health_alerts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 source_kind TEXT,
 source_id UUID,
 code TEXT NOT NULL,
 severity TEXT NOT NULL CHECK (severity IN ('INFO','WARNING','CRITICAL')),
 title TEXT NOT NULL,
 body TEXT,
 state TEXT NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
 dedupe_key TEXT NOT NULL,
 occurrences INTEGER NOT NULL DEFAULT 1,
 details JSONB NOT NULL DEFAULT '{}',
 first_seen_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 last_seen_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 acknowledged_by_id UUID,
 acknowledged_at TIMESTAMPTZ(3),
 resolved_at TIMESTAMPTZ(3),
 UNIQUE (organization_id, dedupe_key)
);
CREATE INDEX health_alerts_state_idx ON health_alerts(organization_id, state, severity);

-- 5) Estende as comunicações (court_notices) sem tocar no que existe.
ALTER TABLE court_notices
 ADD COLUMN origin_kind TEXT CHECK (origin_kind IN ('DJEN_PUBLICATION','PRIVATE_COMMUNICATION','PROCESS_MOVEMENT','IMPORT','MANUAL')),
 ADD COLUMN source_system TEXT,
 ADD COLUMN official_id TEXT,
 ADD COLUMN court_code TEXT,
 ADD COLUMN professional_id UUID REFERENCES professional_identities(id) ON DELETE SET NULL,
 ADD COLUMN captured_at TIMESTAMPTZ(3),
 ADD COLUMN sync_run_id UUID REFERENCES sync_runs(id) ON DELETE SET NULL,
 ADD COLUMN first_viewed_at TIMESTAMPTZ(3),
 ADD COLUMN first_viewed_by_id UUID,
 ADD COLUMN official_ack_at TIMESTAMPTZ(3),
 ADD COLUMN official_ack_state TEXT CHECK (official_ack_state IN ('NOT_APPLICABLE','PENDING','ACKNOWLEDGED','UNKNOWN')),
 ADD COLUMN case_match_state TEXT CHECK (case_match_state IN ('LINKED','AMBIGUOUS','NOT_FOUND','NO_CNJ'));

-- Preenche o que já é conhecido a partir da chave externa (compatível com os registros antigos).
UPDATE court_notices SET
 origin_kind = CASE
   WHEN external_key LIKE 'djen:%' THEN 'DJEN_PUBLICATION'
   WHEN external_key LIKE 'mni:%' THEN 'PRIVATE_COMMUNICATION'
   WHEN source = 'IMPORTED' THEN 'IMPORT'
   ELSE 'MANUAL' END,
 source_system = CASE WHEN external_key LIKE 'djen:%' THEN 'djen' WHEN external_key LIKE 'mni:%' THEN 'pje-mni' ELSE NULL END,
 official_id = CASE WHEN external_key LIKE 'djen:%' THEN substr(external_key, 6) WHEN external_key LIKE 'mni:%' THEN substr(external_key, 5) ELSE NULL END,
 captured_at = CASE WHEN external_key LIKE 'djen:%' OR external_key LIKE 'mni:%' THEN created_at ELSE NULL END,
 official_ack_state = CASE WHEN external_key LIKE 'djen:%' THEN 'NOT_APPLICABLE' WHEN external_key LIKE 'mni:%' THEN 'UNKNOWN' ELSE NULL END,
 case_match_state = CASE WHEN case_id IS NOT NULL THEN 'LINKED' WHEN case_number IS NULL OR case_number = '' THEN 'NO_CNJ' ELSE 'NOT_FOUND' END;

CREATE INDEX court_notices_origin_idx ON court_notices(organization_id, origin_kind, status);
CREATE INDEX court_notices_created_idx ON court_notices(organization_id, created_at DESC);
CREATE INDEX court_notices_professional_idx ON court_notices(organization_id, professional_id) WHERE professional_id IS NOT NULL;

-- 6) Monitoramentos DJEN ligados à identidade profissional, com checkpoint e provas.
ALTER TABLE djen_monitors
 ADD COLUMN professional_id UUID REFERENCES professional_identities(id) ON DELETE SET NULL,
 ADD COLUMN checkpoint JSONB,
 ADD COLUMN last_success_at TIMESTAMPTZ(3),
 ADD COLUMN last_capture_at TIMESTAMPTZ(3),
 ADD COLUMN first_verified_at TIMESTAMPTZ(3);
UPDATE djen_monitors m SET professional_id = p.id
 FROM professional_identities p
 WHERE p.organization_id = m.organization_id AND p.oab_uf = m.oab_uf AND p.oab_number = m.oab_number;
UPDATE djen_monitors SET last_success_at = last_sync_at, first_verified_at = last_sync_at WHERE last_status = 'OK';
UPDATE djen_monitors dm SET last_capture_at = x.last_at
 FROM (SELECT organization_id, max(created_at) AS last_at FROM court_notices WHERE external_key LIKE 'djen:%' GROUP BY organization_id) x
 WHERE x.organization_id = dm.organization_id;

-- 7) Histórico e evidência de cada comunicação (captura, visualização, ciência, atribuição...).
CREATE TABLE notice_events (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 notice_id UUID NOT NULL REFERENCES court_notices(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK (kind IN ('CAPTURED','VIEWED','ASSIGNED','LINKED','STATUS','OFFICIAL_ACK','DOCUMENT','NOTE','EVIDENCE')),
 actor_id UUID,
 run_id UUID REFERENCES sync_runs(id) ON DELETE SET NULL,
 data JSONB NOT NULL DEFAULT '{}',
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX notice_events_notice_idx ON notice_events(notice_id, created_at);
CREATE INDEX notice_events_org_idx ON notice_events(organization_id, created_at DESC);

-- Para as comunicações já capturadas, registra o evento de captura com a origem conhecida (sem inventar detalhes).
INSERT INTO notice_events (organization_id, notice_id, kind, data, created_at)
SELECT organization_id, id, 'CAPTURED', jsonb_build_object('backfilled', true, 'externalKey', external_key), created_at
FROM court_notices WHERE external_key LIKE 'djen:%' OR external_key LIKE 'mni:%';
