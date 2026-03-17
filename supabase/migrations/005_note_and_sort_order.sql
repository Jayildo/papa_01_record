-- 1. Add note column to tree_records
ALTER TABLE tree_records
  ADD COLUMN IF NOT EXISTS note text DEFAULT '' NOT NULL;

-- 2. Update batch_update_records to include note field
CREATE OR REPLACE FUNCTION batch_update_records(
  p_project_id UUID,
  p_records JSONB
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE tree_records t SET
    diameter = (r->>'diameter')::numeric,
    species  = r->>'species',
    location = r->>'location',
    note     = COALESCE(r->>'note', ''),
    sort_order = (r->>'sort_order')::int
  FROM jsonb_array_elements(p_records) r
  WHERE t.id = (r->>'id')::int
    AND t.project_id = p_project_id
    AND t.deleted_at IS NULL;
END;
$$;

-- 3. RPC for batch sort_order update (lightweight, only updates sort_order)
CREATE OR REPLACE FUNCTION batch_update_sort_order(
  p_project_id UUID,
  p_records JSONB
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE tree_records t SET
    sort_order = (r->>'sort_order')::int
  FROM jsonb_array_elements(p_records) r
  WHERE t.id = (r->>'id')::int
    AND t.project_id = p_project_id
    AND t.deleted_at IS NULL;
END;
$$;
