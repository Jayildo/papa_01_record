-- 018_enable_rls.sql
-- Purpose: close the "RLS Disabled in Public" security gap by switching from
-- anon-key-wide-open access to authenticated-only access backed by Supabase
-- Auth sessions. The pin-login Edge Function produces those sessions after
-- verifying the 6-digit PIN server-side.
--
-- What this migration does:
--   1. Enable RLS on every application table.
--   2. Add a permissive policy for role `authenticated` (single-tenant app,
--      no per-row access rules needed — the real boundary is auth vs no-auth).
--   3. Revoke ALL privileges from role `anon` so an exposed anon key becomes
--      useless for database access.
--   4. Grant table DML and RPC EXECUTE only to `authenticated`.
--
-- Rollback (if needed):
--   BEGIN;
--   DO $$ DECLARE t text;
--   BEGIN
--     FOR t IN SELECT unnest(ARRAY[
--       'projects','tree_records','record_history',
--       'labor_projects','labor_workers','labor_entries','labor_project_history',
--       'labor_companies','labor_worker_pool',
--       'work_logs','work_log_laborers','work_log_items','work_log_history'
--     ]) LOOP
--       EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
--       EXECUTE format('GRANT ALL ON %I TO anon', t);
--     END LOOP;
--   END$$;
--   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
--   COMMIT;

BEGIN;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'projects',
    'tree_records',
    'record_history',
    'labor_projects',
    'labor_workers',
    'labor_entries',
    'labor_project_history',
    'labor_companies',
    'labor_worker_pool',
    'work_logs',
    'work_log_laborers',
    'work_log_items',
    'work_log_history'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS "authenticated_all" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "authenticated_all" ON public.%I '
      'FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t
    );

    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', t);
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated',
      t
    );
  END LOOP;
END$$;

-- Sequences (serial PK on tree_records, record_history, labor_entries, ...).
-- authenticated needs USAGE/SELECT to generate IDs on INSERT.
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- RPC functions that the client calls (see src/utils/syncEngine.ts).
REVOKE EXECUTE ON FUNCTION public.batch_update_records(uuid, jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.batch_update_sort_order(uuid, jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_update_records(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.batch_update_sort_order(uuid, jsonb) TO authenticated;

-- cleanup_old_history is admin-only (no client call site); leave restricted.
REVOKE EXECUTE ON FUNCTION public.cleanup_old_history(int) FROM anon, PUBLIC;

COMMIT;
