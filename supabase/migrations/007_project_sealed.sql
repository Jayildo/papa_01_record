-- 007: 프로젝트 확정(seal) 기능
-- sealed=true인 프로젝트의 레코드는 수정/삭제/추가 불가

ALTER TABLE projects ADD COLUMN IF NOT EXISTS sealed boolean DEFAULT false;

-- sealed 프로젝트의 레코드 변경 차단
CREATE OR REPLACE FUNCTION prevent_sealed_project_changes()
RETURNS TRIGGER AS $$
DECLARE
  is_sealed boolean;
BEGIN
  -- INSERT/UPDATE 시 project_id로 sealed 체크
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    SELECT sealed INTO is_sealed FROM projects WHERE id = NEW.project_id;
    IF is_sealed = true THEN
      RAISE EXCEPTION 'Project is sealed. Cannot modify records.';
    END IF;
  END IF;

  -- DELETE는 soft delete trigger에서 처리되므로 UPDATE로 옴
  IF TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    SELECT sealed INTO is_sealed FROM projects WHERE id = NEW.project_id;
    IF is_sealed = true THEN
      RAISE EXCEPTION 'Project is sealed. Cannot delete records.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tree_records_prevent_sealed_changes ON tree_records;
CREATE TRIGGER tree_records_prevent_sealed_changes
  BEFORE INSERT OR UPDATE ON tree_records
  FOR EACH ROW
  EXECUTE FUNCTION prevent_sealed_project_changes();
