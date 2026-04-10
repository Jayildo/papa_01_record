-- 009: allow browser anon access for labor module

ALTER TABLE labor_projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE labor_workers DISABLE ROW LEVEL SECURITY;
ALTER TABLE labor_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE labor_project_history DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON labor_projects TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON labor_workers TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON labor_entries TO anon, authenticated;
GRANT SELECT ON labor_project_history TO anon, authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
