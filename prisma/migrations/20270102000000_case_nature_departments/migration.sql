CREATE TABLE case_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  area TEXT NOT NULL,
  UNIQUE (organization_id, area)
);
ALTER TABLE cases ADD COLUMN nature TEXT NOT NULL DEFAULT 'CASE',
  ADD COLUMN department_id UUID REFERENCES case_departments(id) ON DELETE SET NULL;
UPDATE cases SET nature = 'JUDICIAL' WHERE nullif(trim(number), '') IS NOT NULL;
ALTER TABLE cases ADD CONSTRAINT cases_nature_check CHECK (nature IN ('CASE', 'ADMINISTRATIVE', 'JUDICIAL'));
INSERT INTO case_departments (organization_id, name, area)
  SELECT DISTINCT organization_id, area, area FROM cases WHERE nullif(trim(area), '') IS NOT NULL;
UPDATE cases c SET department_id = d.id FROM case_departments d
 WHERE c.organization_id = d.organization_id AND c.area = d.area;
CREATE INDEX cases_department_nature_idx ON cases (organization_id, department_id, nature);
