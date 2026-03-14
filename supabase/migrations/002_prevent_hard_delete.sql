-- Prevent hard DELETE on tree_records
-- Converts any DELETE attempt to soft delete (sets deleted_at)
-- This protects against old cached code that uses DELETE ALL pattern

CREATE OR REPLACE FUNCTION prevent_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Convert DELETE to soft delete
  UPDATE tree_records SET deleted_at = now() WHERE id = OLD.id;
  RETURN NULL; -- Cancel the actual DELETE
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tree_records_prevent_delete ON tree_records;
CREATE TRIGGER tree_records_prevent_delete
  BEFORE DELETE ON tree_records FOR EACH ROW EXECUTE FUNCTION prevent_hard_delete();
