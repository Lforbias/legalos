-- Box 2.0 — certificados: CONSULTAR e ASSINAR/PROTOCOLAR passam a ser poderes independentes.
-- Migração aditiva e reversível (as colunas novas podem ser ignoradas pelo código antigo).

ALTER TABLE certificates
  ADD COLUMN signing_enabled_at TIMESTAMPTZ(3),
  ADD COLUMN signing_enabled_by_id UUID;

ALTER TABLE certificate_authorized_users
  ADD COLUMN can_sign BOOLEAN NOT NULL DEFAULT false;

-- Preserva o comportamento anterior: certificados que NÃO estavam travados em "somente consulta" (cadastrados antes da trava)
-- continuam podendo ser usados por quem já estava autorizado. Certificados em somente consulta seguem bloqueados.
UPDATE certificate_authorized_users u
   SET can_sign = true
  FROM certificates c
 WHERE c.id = u.certificate_id AND c.consultation_only = false;

-- Nova permissão de perfil: "assinar e protocolar com certificado digital". Mesmos perfis que já gerenciam o cofre.
UPDATE roles SET permissions = array_append(permissions, 'certificates:sign')
 WHERE is_system AND key IN ('OWNER', 'ADMIN') AND NOT ('certificates:sign' = ANY(permissions));
