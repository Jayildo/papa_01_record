-- 90일 초과 이력 삭제 함수
CREATE OR REPLACE FUNCTION cleanup_old_history(retention_days INT DEFAULT 90)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM record_history
  WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- 사용법: SELECT cleanup_old_history();        -- 기본 90일
--         SELECT cleanup_old_history(180);     -- 180일로 변경 가능
