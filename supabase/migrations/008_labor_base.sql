-- 008: labor cost module base schema

CREATE TABLE IF NOT EXISTS labor_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company_name text NOT NULL DEFAULT '',
  site_name text NOT NULL DEFAULT '',
  work_year integer NOT NULL,
  work_month integer NOT NULL CHECK (work_month BETWEEN 1 AND 12),
  manager_name text NOT NULL DEFAULT '',
  payment_date date,
  sealed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS labor_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES labor_projects(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  resident_id text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  daily_wage numeric(12, 2) NOT NULL DEFAULT 0,
  job_type text NOT NULL DEFAULT '',
  team_name text NOT NULL DEFAULT '',
  bank_name text NOT NULL DEFAULT '',
  account_number text NOT NULL DEFAULT '',
  account_holder text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS labor_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES labor_projects(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES labor_workers(id) ON DELETE CASCADE,
  day integer NOT NULL CHECK (day BETWEEN 1 AND 31),
  units numeric(6, 2) NOT NULL DEFAULT 0 CHECK (units >= 0),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (worker_id, day)
);

CREATE TABLE IF NOT EXISTS labor_project_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id uuid NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('project', 'worker', 'entry')),
  entity_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('insert','update','delete','restore')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_labor_projects_active
  ON labor_projects (created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_labor_workers_project_active
  ON labor_workers (project_id, sort_order)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_labor_entries_project_active
  ON labor_entries (project_id, worker_id, day)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_labor_project_history_project
  ON labor_project_history (project_id, created_at DESC);

CREATE OR REPLACE FUNCTION labor_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS labor_projects_updated_at ON labor_projects;
CREATE TRIGGER labor_projects_updated_at
  BEFORE UPDATE ON labor_projects
  FOR EACH ROW EXECUTE FUNCTION labor_update_updated_at();

DROP TRIGGER IF EXISTS labor_workers_updated_at ON labor_workers;
CREATE TRIGGER labor_workers_updated_at
  BEFORE UPDATE ON labor_workers
  FOR EACH ROW EXECUTE FUNCTION labor_update_updated_at();

DROP TRIGGER IF EXISTS labor_entries_updated_at ON labor_entries;
CREATE TRIGGER labor_entries_updated_at
  BEFORE UPDATE ON labor_entries
  FOR EACH ROW EXECUTE FUNCTION labor_update_updated_at();

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
    next_entity_id := COALESCE(NEW.id, OLD.id)::text;
    next_project_id := COALESCE(NEW.id, OLD.id);
  ELSIF TG_TABLE_NAME = 'labor_workers' THEN
    next_entity_type := 'worker';
    next_entity_id := COALESCE(NEW.id, OLD.id)::text;
    next_project_id := COALESCE(NEW.project_id, OLD.project_id);
  ELSE
    next_entity_type := 'entry';
    next_entity_id := COALESCE(NEW.id, OLD.id)::text;
    next_project_id := COALESCE(NEW.project_id, OLD.project_id);
  END IF;

  IF TG_OP = 'INSERT' THEN
    next_action := 'insert';
    INSERT INTO labor_project_history (project_id, entity_type, entity_id, action, new_data)
    VALUES (next_project_id, next_entity_type, next_entity_id, next_action, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  next_action := CASE
    WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN 'delete'
    WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN 'restore'
    ELSE 'update'
  END;

  INSERT INTO labor_project_history (project_id, entity_type, entity_id, action, old_data, new_data)
  VALUES (next_project_id, next_entity_type, next_entity_id, next_action, to_jsonb(OLD), to_jsonb(NEW));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS labor_projects_history ON labor_projects;
CREATE TRIGGER labor_projects_history
  AFTER INSERT OR UPDATE ON labor_projects
  FOR EACH ROW EXECUTE FUNCTION log_labor_history();

DROP TRIGGER IF EXISTS labor_workers_history ON labor_workers;
CREATE TRIGGER labor_workers_history
  AFTER INSERT OR UPDATE ON labor_workers
  FOR EACH ROW EXECUTE FUNCTION log_labor_history();

DROP TRIGGER IF EXISTS labor_entries_history ON labor_entries;
CREATE TRIGGER labor_entries_history
  AFTER INSERT OR UPDATE ON labor_entries
  FOR EACH ROW EXECUTE FUNCTION log_labor_history();

CREATE OR REPLACE FUNCTION prevent_sealed_labor_changes()
RETURNS TRIGGER AS $$
DECLARE
  is_sealed boolean;
BEGIN
  IF TG_TABLE_NAME = 'labor_projects' THEN
    IF TG_OP = 'UPDATE' AND OLD.sealed = true AND NEW.sealed = true THEN
      RAISE EXCEPTION 'Labor project is sealed. Cannot modify project.';
    END IF;
    RETURN NEW;
  END IF;

  SELECT sealed INTO is_sealed
  FROM labor_projects
  WHERE id = COALESCE(NEW.project_id, OLD.project_id);

  IF is_sealed = true THEN
    RAISE EXCEPTION 'Labor project is sealed. Cannot modify records.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS labor_projects_prevent_sealed ON labor_projects;
CREATE TRIGGER labor_projects_prevent_sealed
  BEFORE UPDATE ON labor_projects
  FOR EACH ROW EXECUTE FUNCTION prevent_sealed_labor_changes();

DROP TRIGGER IF EXISTS labor_workers_prevent_sealed ON labor_workers;
CREATE TRIGGER labor_workers_prevent_sealed
  BEFORE INSERT OR UPDATE ON labor_workers
  FOR EACH ROW EXECUTE FUNCTION prevent_sealed_labor_changes();

DROP TRIGGER IF EXISTS labor_entries_prevent_sealed ON labor_entries;
CREATE TRIGGER labor_entries_prevent_sealed
  BEFORE INSERT OR UPDATE ON labor_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_sealed_labor_changes();
