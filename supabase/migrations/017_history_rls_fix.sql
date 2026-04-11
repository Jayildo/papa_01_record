-- 017: work_log_history RLS/권한 수정
-- 015 에서 work_log_history 를 만들면서 RLS 비활성화/GRANT 를 누락했음
-- 트리거가 anon 권한으로 실행될 때 RLS 에 막혀 401 발생

ALTER TABLE work_log_history DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON work_log_history TO anon, authenticated;

-- labor_project_history 도 방어적으로 같이 처리 (이미 동작 중이지만 일관성)
ALTER TABLE labor_project_history DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON labor_project_history TO anon, authenticated;

-- record_history 도 같이 처리
ALTER TABLE record_history DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON record_history TO anon, authenticated;
