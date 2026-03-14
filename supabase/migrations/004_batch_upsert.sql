-- 배치 UPDATE: 변경된 레코드만 한 번의 호출로 처리
-- App에서 supabase.rpc('batch_update_records', { p_project_id, p_records }) 로 호출

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
    sort_order = (r->>'sort_order')::int
  FROM jsonb_array_elements(p_records) r
  WHERE t.id = (r->>'id')::int
    AND t.project_id = p_project_id
    AND t.deleted_at IS NULL;
END;
$$;

-- 사용법:
-- SELECT batch_update_records(
--   '프로젝트UUID',
--   '[{"id":1,"diameter":25,"species":"낙엽수","location":"A구역","sort_order":0}]'::jsonb
-- );
