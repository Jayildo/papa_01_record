-- 010: labor shared company fields and worker calculation type

ALTER TABLE labor_projects
  ADD COLUMN IF NOT EXISTS workplace_management_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS business_registration_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_phone text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS representative_name text NOT NULL DEFAULT '';

ALTER TABLE labor_workers
  ADD COLUMN IF NOT EXISTS calculation_type text NOT NULL DEFAULT 'daily_tax';
