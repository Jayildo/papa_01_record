-- 013: normalize labor module — master tables for companies and worker pool
--
-- Creates labor_companies and labor_worker_pool as shared master tables,
-- links them to labor_projects and labor_workers respectively,
-- and drops denormalized columns from labor_projects.

-- ============================================================
-- Step 1: Widen entity_type CHECK on labor_project_history
-- Must come before history triggers fire for new tables.
-- ============================================================

ALTER TABLE labor_project_history
  DROP CONSTRAINT IF EXISTS labor_project_history_entity_type_check;

ALTER TABLE labor_project_history
  ADD CONSTRAINT labor_project_history_entity_type_check
    CHECK (entity_type IN ('project', 'worker', 'entry', 'company', 'pool_worker'));

-- ============================================================
-- Step 2: Update log_labor_history() to handle new tables
-- ============================================================

CREATE OR REPLACE FUNCTION log_labor_history()
RETURNS TRIGGER AS $$
DECLARE
  next_action text;
  next_project_id uuid;
  next_entity_type text;
  next_entity_id text;
BEGIN
  IF TG_TABLE_NAME = 'labor_projects' THEN
    next_entity_type := 'project';
    next_entity_id  := COALESCE(NEW.id, OLD.id)::text;
    next_project_id := COALESCE(NEW.id, OLD.id);

  ELSIF TG_TABLE_NAME = 'labor_workers' THEN
    next_entity_type := 'worker';
    next_entity_id  := COALESCE(NEW.id, OLD.id)::text;
    next_project_id := COALESCE(NEW.project_id, OLD.project_id);

  ELSIF TG_TABLE_NAME = 'labor_companies' THEN
    next_entity_type := 'company';
    next_entity_id  := COALESCE(NEW.id, OLD.id)::text;
    -- companies aren't project-scoped; use own id as pseudo project_id
    next_project_id := COALESCE(NEW.id, OLD.id);

  ELSIF TG_TABLE_NAME = 'labor_worker_pool' THEN
    next_entity_type := 'pool_worker';
    next_entity_id  := COALESCE(NEW.id, OLD.id)::text;
    -- pool workers aren't project-scoped; use sentinel UUID
    next_project_id := '00000000-0000-0000-0000-000000000000'::uuid;

  ELSE
    -- fallback: labor_entries and any future tables
    next_entity_type := 'entry';
    next_entity_id  := COALESCE(NEW.id, OLD.id)::text;
    next_project_id := COALESCE(NEW.project_id, OLD.project_id);
  END IF;

  IF TG_OP = 'INSERT' THEN
    next_action := 'insert';
    INSERT INTO labor_project_history
      (project_id, entity_type, entity_id, action, new_data)
    VALUES
      (next_project_id, next_entity_type, next_entity_id, next_action, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  next_action := CASE
    WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN 'delete'
    WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN 'restore'
    ELSE 'update'
  END;

  INSERT INTO labor_project_history
    (project_id, entity_type, entity_id, action, old_data, new_data)
  VALUES
    (next_project_id, next_entity_type, next_entity_id, next_action, to_jsonb(OLD), to_jsonb(NEW));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Step 3: Create labor_companies
-- ============================================================

CREATE TABLE IF NOT EXISTS labor_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT '',
  representative_name text NOT NULL DEFAULT '',
  business_registration_number text NOT NULL DEFAULT '',
  company_address text NOT NULL DEFAULT '',
  company_phone text NOT NULL DEFAULT '',
  company_phone_mobile text NOT NULL DEFAULT '',
  company_fax text NOT NULL DEFAULT '',
  workplace_management_number text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_labor_companies_active
  ON labor_companies (created_at DESC)
  WHERE deleted_at IS NULL;

-- ============================================================
-- Step 4: Create labor_worker_pool
-- ============================================================

CREATE TABLE IF NOT EXISTS labor_worker_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  resident_id text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  job_type text NOT NULL DEFAULT '',
  team_name text NOT NULL DEFAULT '',
  bank_name text NOT NULL DEFAULT '',
  account_number text NOT NULL DEFAULT '',
  account_holder text NOT NULL DEFAULT '',
  employment_duration_type text NOT NULL DEFAULT 'under_1_month'
    CHECK (employment_duration_type IN ('under_1_month', 'one_month_or_more')),
  workplace_type text NOT NULL DEFAULT 'construction'
    CHECK (workplace_type IN ('construction', 'general')),
  default_daily_wage numeric(12, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_labor_worker_pool_active
  ON labor_worker_pool (name)
  WHERE deleted_at IS NULL;

-- ============================================================
-- Step 5: Triggers for new tables
-- ============================================================

-- updated_at triggers
DROP TRIGGER IF EXISTS labor_companies_updated_at ON labor_companies;
CREATE TRIGGER labor_companies_updated_at
  BEFORE UPDATE ON labor_companies
  FOR EACH ROW EXECUTE FUNCTION labor_update_updated_at();

DROP TRIGGER IF EXISTS labor_worker_pool_updated_at ON labor_worker_pool;
CREATE TRIGGER labor_worker_pool_updated_at
  BEFORE UPDATE ON labor_worker_pool
  FOR EACH ROW EXECUTE FUNCTION labor_update_updated_at();

-- history triggers
DROP TRIGGER IF EXISTS labor_companies_history ON labor_companies;
CREATE TRIGGER labor_companies_history
  AFTER INSERT OR UPDATE ON labor_companies
  FOR EACH ROW EXECUTE FUNCTION log_labor_history();

DROP TRIGGER IF EXISTS labor_worker_pool_history ON labor_worker_pool;
CREATE TRIGGER labor_worker_pool_history
  AFTER INSERT OR UPDATE ON labor_worker_pool
  FOR EACH ROW EXECUTE FUNCTION log_labor_history();

-- ============================================================
-- Step 6: Modify labor_projects
-- ============================================================

-- Add new columns
ALTER TABLE labor_projects
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES labor_companies(id);

ALTER TABLE labor_projects
  ADD COLUMN IF NOT EXISTS manager_resident_id text NOT NULL DEFAULT '';

ALTER TABLE labor_projects
  ADD COLUMN IF NOT EXISTS manager_title text NOT NULL DEFAULT '';

ALTER TABLE labor_projects
  ADD COLUMN IF NOT EXISTS manager_job_description text NOT NULL DEFAULT '';

-- Drop denormalized columns (IF EXISTS for safety)
ALTER TABLE labor_projects DROP COLUMN IF EXISTS company_name;
ALTER TABLE labor_projects DROP COLUMN IF EXISTS representative_name;
ALTER TABLE labor_projects DROP COLUMN IF EXISTS business_registration_number;
ALTER TABLE labor_projects DROP COLUMN IF EXISTS company_address;
ALTER TABLE labor_projects DROP COLUMN IF EXISTS company_phone;
ALTER TABLE labor_projects DROP COLUMN IF EXISTS workplace_management_number;
ALTER TABLE labor_projects DROP COLUMN IF EXISTS company_phone_mobile;
ALTER TABLE labor_projects DROP COLUMN IF EXISTS company_fax;

-- ============================================================
-- Step 7: Modify labor_workers — add pool reference
-- ============================================================

ALTER TABLE labor_workers
  ADD COLUMN IF NOT EXISTS pool_worker_id uuid REFERENCES labor_worker_pool(id);

-- ============================================================
-- Step 8: RLS and grants for new tables
-- ============================================================

ALTER TABLE labor_companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE labor_worker_pool DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON labor_companies TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON labor_worker_pool TO anon, authenticated;
