-- Migration: Data protection system
-- Adds soft delete, updated_at tracking, and change history

-- 1. Add columns to tree_records
ALTER TABLE tree_records
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now() NOT NULL,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;

-- 2. Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tree_records_updated_at ON tree_records;
CREATE TRIGGER tree_records_updated_at
  BEFORE UPDATE ON tree_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. Partial index for active records
CREATE INDEX IF NOT EXISTS idx_tree_records_active
  ON tree_records (project_id) WHERE deleted_at IS NULL;

-- 4. Change history table
CREATE TABLE IF NOT EXISTS record_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  record_id bigint NOT NULL,
  project_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('insert','update','delete','restore')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_record_history_project ON record_history (project_id);

-- 5. Auto-log history trigger
CREATE OR REPLACE FUNCTION log_record_history()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO record_history (record_id, project_id, action, new_data)
    VALUES (NEW.id, NEW.project_id, 'insert', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO record_history (record_id, project_id, action, old_data, new_data)
    VALUES (NEW.id, NEW.project_id,
      CASE WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN 'delete'
           WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN 'restore'
           ELSE 'update' END,
      to_jsonb(OLD), to_jsonb(NEW));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tree_records_history ON tree_records;
CREATE TRIGGER tree_records_history
  AFTER INSERT OR UPDATE ON tree_records FOR EACH ROW EXECUTE FUNCTION log_record_history();
