-- 015: 작업일지 모듈 보호 강화 — prevent_hard_delete + history + sealed
-- 수목계측(001/002/007) 패턴을 작업일지에 그대로 이식

-- ============================================================
-- Step 1: prevent_hard_delete 트리거 (3개 테이블)
-- DELETE 시도를 soft delete 로 자동 변환
-- ============================================================

CREATE OR REPLACE FUNCTION worklog_prevent_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'work_logs' THEN
    UPDATE work_logs SET deleted_at = now() WHERE id = OLD.id AND deleted_at IS NULL;
  ELSIF TG_TABLE_NAME = 'work_log_laborers' THEN
    -- sort_order 는 NOT NULL, deleted_at 컬럼 없음 → 컬럼 추가 필요 (Step 2)
    UPDATE work_log_laborers SET deleted_at = now() WHERE id = OLD.id AND deleted_at IS NULL;
  ELSIF TG_TABLE_NAME = 'work_log_items' THEN
    UPDATE work_log_items SET deleted_at = now() WHERE id = OLD.id AND deleted_at IS NULL;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Step 2: 자식 테이블에 deleted_at 컬럼 추가
-- (014 에는 work_logs 만 deleted_at 이 있었음)
-- ============================================================

ALTER TABLE work_log_laborers
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE work_log_items
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE work_log_laborers
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE work_log_items
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- updated_at 트리거 (014의 worklog_update_updated_at 재사용)
DROP TRIGGER IF EXISTS work_log_laborers_updated_at ON work_log_laborers;
CREATE TRIGGER work_log_laborers_updated_at
  BEFORE UPDATE ON work_log_laborers
  FOR EACH ROW EXECUTE FUNCTION worklog_update_updated_at();

DROP TRIGGER IF EXISTS work_log_items_updated_at ON work_log_items;
CREATE TRIGGER work_log_items_updated_at
  BEFORE UPDATE ON work_log_items
  FOR EACH ROW EXECUTE FUNCTION worklog_update_updated_at();

-- Step 1 트리거 연결
DROP TRIGGER IF EXISTS work_logs_prevent_delete ON work_logs;
CREATE TRIGGER work_logs_prevent_delete
  BEFORE DELETE ON work_logs
  FOR EACH ROW EXECUTE FUNCTION worklog_prevent_hard_delete();

DROP TRIGGER IF EXISTS work_log_laborers_prevent_delete ON work_log_laborers;
CREATE TRIGGER work_log_laborers_prevent_delete
  BEFORE DELETE ON work_log_laborers
  FOR EACH ROW EXECUTE FUNCTION worklog_prevent_hard_delete();

DROP TRIGGER IF EXISTS work_log_items_prevent_delete ON work_log_items;
CREATE TRIGGER work_log_items_prevent_delete
  BEFORE DELETE ON work_log_items
  FOR EACH ROW EXECUTE FUNCTION worklog_prevent_hard_delete();

-- ============================================================
-- Step 3: work_log_history 테이블 + 트리거
-- ============================================================

CREATE TABLE IF NOT EXISTS work_log_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  log_id uuid NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('log','laborer','item')),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('insert','update','delete','restore')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_log_history_log
  ON work_log_history (log_id, created_at DESC);

CREATE OR REPLACE FUNCTION log_worklog_history()
RETURNS TRIGGER AS $$
DECLARE
  next_entity_type text;
  next_log_id uuid;
  next_entity_id uuid;
  next_action text;
BEGIN
  IF TG_TABLE_NAME = 'work_logs' THEN
    next_entity_type := 'log';
    next_log_id  := COALESCE(NEW.id, OLD.id);
    next_entity_id := COALESCE(NEW.id, OLD.id);
  ELSIF TG_TABLE_NAME = 'work_log_laborers' THEN
    next_entity_type := 'laborer';
    next_log_id  := COALESCE(NEW.log_id, OLD.log_id);
    next_entity_id := COALESCE(NEW.id, OLD.id);
  ELSE
    next_entity_type := 'item';
    next_log_id  := COALESCE(NEW.log_id, OLD.log_id);
    next_entity_id := COALESCE(NEW.id, OLD.id);
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO work_log_history (log_id, entity_type, entity_id, action, new_data)
    VALUES (next_log_id, next_entity_type, next_entity_id, 'insert', to_jsonb(NEW));
    RETURN NEW;
  END IF;

  next_action := CASE
    WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN 'delete'
    WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN 'restore'
    ELSE 'update'
  END;

  INSERT INTO work_log_history (log_id, entity_type, entity_id, action, old_data, new_data)
  VALUES (next_log_id, next_entity_type, next_entity_id, next_action, to_jsonb(OLD), to_jsonb(NEW));

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS work_logs_history ON work_logs;
CREATE TRIGGER work_logs_history
  AFTER INSERT OR UPDATE ON work_logs
  FOR EACH ROW EXECUTE FUNCTION log_worklog_history();

DROP TRIGGER IF EXISTS work_log_laborers_history ON work_log_laborers;
CREATE TRIGGER work_log_laborers_history
  AFTER INSERT OR UPDATE ON work_log_laborers
  FOR EACH ROW EXECUTE FUNCTION log_worklog_history();

DROP TRIGGER IF EXISTS work_log_items_history ON work_log_items;
CREATE TRIGGER work_log_items_history
  AFTER INSERT OR UPDATE ON work_log_items
  FOR EACH ROW EXECUTE FUNCTION log_worklog_history();

-- ============================================================
-- Step 4: sealed 컬럼 + 변경 차단 트리거
-- ============================================================

ALTER TABLE work_logs
  ADD COLUMN IF NOT EXISTS sealed boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION prevent_sealed_worklog_changes()
RETURNS TRIGGER AS $$
DECLARE
  parent_sealed boolean;
BEGIN
  IF TG_TABLE_NAME = 'work_logs' THEN
    -- sealed 상태에서 sealed 해제 외 모든 UPDATE 차단
    IF TG_OP = 'UPDATE' AND OLD.sealed = true AND NEW.sealed = true THEN
      RAISE EXCEPTION 'Work log is sealed. Cannot modify.';
    END IF;
    RETURN NEW;
  END IF;

  -- 자식 테이블: 부모 work_logs.sealed 체크
  SELECT sealed INTO parent_sealed
  FROM work_logs
  WHERE id = COALESCE(NEW.log_id, OLD.log_id);

  IF parent_sealed = true THEN
    RAISE EXCEPTION 'Parent work log is sealed. Cannot modify children.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS work_logs_prevent_sealed ON work_logs;
CREATE TRIGGER work_logs_prevent_sealed
  BEFORE UPDATE ON work_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_sealed_worklog_changes();

DROP TRIGGER IF EXISTS work_log_laborers_prevent_sealed ON work_log_laborers;
CREATE TRIGGER work_log_laborers_prevent_sealed
  BEFORE INSERT OR UPDATE ON work_log_laborers
  FOR EACH ROW EXECUTE FUNCTION prevent_sealed_worklog_changes();

DROP TRIGGER IF EXISTS work_log_items_prevent_sealed ON work_log_items;
CREATE TRIGGER work_log_items_prevent_sealed
  BEFORE INSERT OR UPDATE ON work_log_items
  FOR EACH ROW EXECUTE FUNCTION prevent_sealed_worklog_changes();

-- ============================================================
-- Step 5: 부모 soft delete 시 자식 동기화 트리거
-- 부모가 soft delete 되면 자식들도 deleted_at 설정
-- ============================================================

CREATE OR REPLACE FUNCTION cascade_worklog_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE work_log_laborers SET deleted_at = NEW.deleted_at
      WHERE log_id = NEW.id AND deleted_at IS NULL;
    UPDATE work_log_items SET deleted_at = NEW.deleted_at
      WHERE log_id = NEW.id AND deleted_at IS NULL;
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    -- restore 시에도 자식 복원
    UPDATE work_log_laborers SET deleted_at = NULL
      WHERE log_id = NEW.id AND deleted_at = OLD.deleted_at;
    UPDATE work_log_items SET deleted_at = NULL
      WHERE log_id = NEW.id AND deleted_at = OLD.deleted_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS work_logs_cascade_soft_delete ON work_logs;
CREATE TRIGGER work_logs_cascade_soft_delete
  AFTER UPDATE ON work_logs
  FOR EACH ROW EXECUTE FUNCTION cascade_worklog_soft_delete();

-- ============================================================
-- Step 6: 활성 행만 조회하는 부분 인덱스
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_work_logs_active
  ON work_logs (work_date DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_work_log_laborers_active
  ON work_log_laborers (log_id, sort_order) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_work_log_items_active
  ON work_log_items (log_id, sort_order) WHERE deleted_at IS NULL;
