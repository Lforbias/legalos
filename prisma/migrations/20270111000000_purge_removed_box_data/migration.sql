-- Remove judicial BOX data while preserving organizations, cases, general documents,
-- tasks, deadlines, clients, and other LegalOS modules.
DELETE FROM petition_receipts;
DELETE FROM petition_attempts;
DELETE FROM petition_attachments;
DELETE FROM petition_filings;

DELETE FROM notice_events;
DELETE FROM notice_triages;
DELETE FROM notice_notes;
DELETE FROM case_events
WHERE kind LIKE 'PETITION_%'
   OR external_key LIKE 'mni:%'
   OR external_key LIKE 'legalmail:%';
-- Preserve the underlying cases, tasks, and deadlines while removing their
-- links to the retired inbox. These restrictive foreign keys otherwise block
-- deletion of court_notices.
UPDATE tasks SET source_notice_id = NULL WHERE source_notice_id IS NOT NULL;
UPDATE deadlines SET source_notice_id = NULL WHERE source_notice_id IS NOT NULL;
UPDATE court_notices SET case_id = NULL, duplicate_of_id = NULL
WHERE case_id IS NOT NULL OR duplicate_of_id IS NOT NULL;
DELETE FROM court_notices;
DELETE FROM autos_download_jobs;

DELETE FROM robot_jobs;
DELETE FROM portal_accesses;
DELETE FROM court_otp_authenticators;
DELETE FROM pje_discoveries;
DELETE FROM court_credentials;
DELETE FROM certificate_usage;
DELETE FROM certificate_authorized_users;
DELETE FROM court_connections;
DELETE FROM djen_monitors;
DELETE FROM certificates;

DELETE FROM sync_runs;
DELETE FROM connector_evidences;
DELETE FROM health_alerts;
DELETE FROM professional_identities;
DELETE FROM court_system_maps;
DELETE FROM legalmail_pilot;

-- Remove the retired capabilities from stored access profiles and API keys.
UPDATE roles SET permissions = array_remove(array_remove(array_remove(array_remove(array_remove(array_remove(array_remove(permissions,
  'inbox:read'), 'inbox:write'), 'petitions:read'), 'petitions:write'), 'petitions:approve'), 'certificates:manage'), 'certificates:sign')
WHERE permissions && ARRAY['inbox:read', 'inbox:write', 'petitions:read', 'petitions:write', 'petitions:approve', 'certificates:manage', 'certificates:sign'];

DELETE FROM api_keys
WHERE scopes <@ ARRAY['pje:discover', 'notices:read', 'notices:write', 'legalmail:ingest'];
UPDATE api_keys SET scopes = array_remove(array_remove(array_remove(array_remove(scopes,
  'pje:discover'), 'notices:read'), 'notices:write'), 'legalmail:ingest')
WHERE scopes && ARRAY['pje:discover', 'notices:read', 'notices:write', 'legalmail:ingest']
  AND cardinality(scopes) > 1;
