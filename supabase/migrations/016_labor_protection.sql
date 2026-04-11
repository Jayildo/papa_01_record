-- 016: 노무비 모듈 prevent_hard_delete 추가
-- 008 에는 sealed/history 는 있으나 hard delete 차단 트리거가 없어 CASCADE 경로로 데이터 물리 삭제 가능
-- 수목계측 002 패턴을 노무비 전 테이블에 이식

-- ============================================================
-- prevent_hard_delete 트리거 (5개 테이블)
-- DELETE 시도를 soft delete 로 자동 변환
-- ============================================================

CREATE OR REPLACE FUNCTION labor_prevent_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'labor_projects' THEN
    UPDATE labor_projects SET deleted_at = now()
      WHERE id = OLD.id AND deleted_at IS NULL;
  ELSIF TG_TABLE_NAME = 'labor_workers' THEN
    UPDATE labor_workers SET deleted_at = now()
      WHERE id = OLD.id AND deleted_at IS NULL;
  ELSIF TG_TABLE_NAME = 'labor_entries' THEN
    UPDATE labor_entries SET deleted_at = now()
      WHERE id = OLD.id AND deleted_at IS NULL;
  ELSIF TG_TABLE_NAME = 'labor_companies' THEN
    UPDATE labor_companies SET deleted_at = now()
      WHERE id = OLD.id AND deleted_at IS NULL;
  ELSIF TG_TABLE_NAME = 'labor_worker_pool' THEN
    UPDATE labor_worker_pool SET deleted_at = now()
      WHERE id = OLD.id AND deleted_at IS NULL;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS labor_projects_prevent_delete ON labor_projects;
CREATE TRIGGER labor_projects_prevent_delete
  BEFORE DELETE ON labor_projects
  FOR EACH ROW EXECUTE FUNCTION labor_prevent_hard_delete();

DROP TRIGGER IF EXISTS labor_workers_prevent_delete ON labor_workers;
CREATE TRIGGER labor_workers_prevent_delete
  BEFORE DELETE ON labor_workers
  FOR EACH ROW EXECUTE FUNCTION labor_prevent_hard_delete();

DROP TRIGGER IF EXISTS labor_entries_prevent_delete ON labor_entries;
CREATE TRIGGER labor_entries_prevent_delete
  BEFORE DELETE ON labor_entries
  FOR EACH ROW EXECUTE FUNCTION labor_prevent_hard_delete();

DROP TRIGGER IF EXISTS labor_companies_prevent_delete ON labor_companies;
CREATE TRIGGER labor_companies_prevent_delete
  BEFORE DELETE ON labor_companies
  FOR EACH ROW EXECUTE FUNCTION labor_prevent_hard_delete();

DROP TRIGGER IF EXISTS labor_worker_pool_prevent_delete ON labor_worker_pool;
CREATE TRIGGER labor_worker_pool_prevent_delete
  BEFORE DELETE ON labor_worker_pool
  FOR EACH ROW EXECUTE FUNCTION labor_prevent_hard_delete();

-- ============================================================
-- 부모 soft delete 시 자식 동기화 트리거
-- labor_projects 가 soft delete 되면 labor_workers, labor_entries 도 동기화
-- labor_workers 가 soft delete 되면 해당 worker 의 labor_entries 동기화
-- ============================================================

CREATE OR REPLACE FUNCTION cascade_labor_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'labor_projects' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      UPDATE labor_workers SET deleted_at = NEW.deleted_at
        WHERE project_id = NEW.id AND deleted_at IS NULL;
      UPDATE labor_entries SET deleted_at = NEW.deleted_at
        WHERE project_id = NEW.id AND deleted_at IS NULL;
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      UPDATE labor_workers SET deleted_at = NULL
        WHERE project_id = NEW.id AND deleted_at = OLD.deleted_at;
      UPDATE labor_entries SET deleted_at = NULL
        WHERE project_id = NEW.id AND deleted_at = OLD.deleted_at;
    END IF;
  ELSIF TG_TABLE_NAME = 'labor_workers' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      UPDATE labor_entries SET deleted_at = NEW.deleted_at
        WHERE worker_id = NEW.id AND deleted_at IS NULL;
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      UPDATE labor_entries SET deleted_at = NULL
        WHERE worker_id = NEW.id AND deleted_at = OLD.deleted_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS labor_projects_cascade_soft_delete ON labor_projects;
CREATE TRIGGER labor_projects_cascade_soft_delete
  AFTER UPDATE ON labor_projects
  FOR EACH ROW EXECUTE FUNCTION cascade_labor_soft_delete();

DROP TRIGGER IF EXISTS labor_workers_cascade_soft_delete ON labor_workers;
CREATE TRIGGER labor_workers_cascade_soft_delete
  AFTER UPDATE ON labor_workers
  FOR EACH ROW EXECUTE FUNCTION cascade_labor_soft_delete();
