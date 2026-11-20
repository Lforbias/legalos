-- MVP: publicações importadas do Astrea ficavam invisíveis porque o importador não marcava a origem.
-- Marca as já importadas (source IMPORTED sem source_system) como vindas do Astrea.
UPDATE court_notices
SET source_system = 'astrea', origin_kind = 'IMPORT'
WHERE source = 'IMPORTED' AND source_system IS NULL;
