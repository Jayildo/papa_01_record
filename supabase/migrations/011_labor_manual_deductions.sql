-- 011: manual deduction fields for labor workers

ALTER TABLE labor_workers
  ADD COLUMN IF NOT EXISTS manual_national_pension numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_health_insurance numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_long_term_care numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_other_deduction numeric(12, 2) NOT NULL DEFAULT 0;
