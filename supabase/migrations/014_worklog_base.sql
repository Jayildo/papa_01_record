-- 014: work_logs module — work log header + laborers + items

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS work_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text,
  work_date date NOT NULL,
  weather text,
  temperature text,
  location text,
  work_desc text,
  total_amount bigint,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS work_logs_external_id_unique
  ON work_logs (external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS work_logs_work_date_idx ON work_logs (work_date);

CREATE TABLE IF NOT EXISTS work_log_laborers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id uuid NOT NULL REFERENCES work_logs(id) ON DELETE CASCADE,
  name text NOT NULL,
  resident_id text,
  company text,
  daily_wage bigint,
  note text,
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS work_log_laborers_log_id_idx ON work_log_laborers (log_id);

CREATE TABLE IF NOT EXISTS work_log_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id uuid NOT NULL REFERENCES work_logs(id) ON DELETE CASCADE,
  category text,
  detail text,
  unit text,
  qty numeric,
  amount bigint,
  note text,
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS work_log_items_log_id_idx ON work_log_items (log_id);

-- ============================================================
-- updated_at trigger (reuse labor_update_updated_at if present)
-- ============================================================

CREATE OR REPLACE FUNCTION worklog_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS work_logs_updated_at ON work_logs;
CREATE TRIGGER work_logs_updated_at
  BEFORE UPDATE ON work_logs
  FOR EACH ROW EXECUTE FUNCTION worklog_update_updated_at();

-- ============================================================
-- RLS — disable (anon full access, same pattern as labor tables)
-- ============================================================

ALTER TABLE work_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE work_log_laborers DISABLE ROW LEVEL SECURITY;
ALTER TABLE work_log_items DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON work_logs TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON work_log_laborers TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON work_log_items TO anon, authenticated;
