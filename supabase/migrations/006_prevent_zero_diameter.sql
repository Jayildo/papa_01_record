-- 006: diameter=0 INSERT/UPDATE 원천 차단
-- 앱 코드 버그나 PWA 캐시 문제로 d=0이 DB에 도달하는 것을 방지

CREATE OR REPLACE FUNCTION prevent_zero_diameter()
RETURNS TRIGGER AS $$
BEGIN
  -- INSERT: diameter가 0 이하면 무시 (행 삽입 안 함)
  IF TG_OP = 'INSERT' AND (NEW.diameter IS NULL OR NEW.diameter <= 0) THEN
    RAISE WARNING 'Blocked INSERT with diameter=% for project=%', NEW.diameter, NEW.project_id;
    RETURN NULL;
  END IF;

  -- UPDATE: diameter를 0 이하로 변경하려 하면 원래 값 유지
  IF TG_OP = 'UPDATE' AND (NEW.diameter IS NULL OR NEW.diameter <= 0) THEN
    IF OLD.diameter > 0 THEN
      RAISE WARNING 'Blocked UPDATE diameter % -> % for id=%', OLD.diameter, NEW.diameter, OLD.id;
      NEW.diameter := OLD.diameter;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tree_records_prevent_zero_diameter ON tree_records;
CREATE TRIGGER tree_records_prevent_zero_diameter
  BEFORE INSERT OR UPDATE ON tree_records
  FOR EACH ROW
  EXECUTE FUNCTION prevent_zero_diameter();
