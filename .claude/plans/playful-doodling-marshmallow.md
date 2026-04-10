# Sync 최적화 — 변경 기반 동기화

## Context
현재 sync는 매 편집마다 전체 레코드를 서버와 비교(full diff)하고,
변경된 레코드마다 개별 UPDATE API를 호출한다.
레코드 100건이면 100번의 API 호출 → 비효율적이고 대규모 시 문제 가능.

## 현재 구조의 문제점

| 문제 | 영향 |
|------|------|
| 매 sync마다 서버 전체 fetch | 불필요한 네트워크 비용 |
| 개별 UPDATE × N건 | 레코드 100건 = 100 API 호출 |
| sort_order만 바뀌어도 전체 diff | 행 순서 변경 시 모든 레코드 UPDATE |
| 1.5초 디바운스 | 빠른 연속 편집 시 잦은 sync |

## 수정 방안

### 1. Dirty 레코드 추적 (핵심)
- `dirtyIds: Set<number>` — 실제 변경된 레코드 ID만 추적
- sync 시 dirty 레코드만 전송 (전체 diff 불필요)
- 서버 전체 fetch 제거 (insert/delete는 명시적 추적)

### 2. Postgres RPC로 배치 UPDATE (1 API 호출로 통합)
```sql
CREATE OR REPLACE FUNCTION batch_upsert_records(p_project_id UUID, p_records JSONB)
RETURNS SETOF tree_records AS $$
  UPDATE tree_records t SET
    diameter = (r->>'diameter')::numeric,
    species = r->>'species',
    location = r->>'location',
    sort_order = (r->>'sort_order')::int
  FROM jsonb_array_elements(p_records) r
  WHERE t.id = (r->>'id')::int
    AND t.project_id = p_project_id
  RETURNING t.*;
$$ LANGUAGE sql;
```
→ N건 UPDATE = 1 RPC 호출

### 3. 디바운스 3초로 증가
- 1.5초 → 3초: 연속 편집 시 sync 횟수 절반으로 감소

### 4. 변경 추적 구조

```
App.tsx:
  pendingChanges = useRef({
    updates: Map<number, TreeRecord>,  // 수정된 레코드
    inserts: TreeRecord[],              // 새 레코드
    deletes: number[],                  // 삭제할 ID
  })
```

편집 시: `pendingChanges.updates.set(id, record)`
행 추가: `pendingChanges.inserts.push(record)`
행 삭제: `pendingChanges.deletes.push(id)`

sync 시: pendingChanges만 전송 → 완료 후 초기화

## 파일별 변경

| 파일 | 변경 |
|------|------|
| `src/App.tsx` | pendingChanges ref 추가, setRecords에서 변경 추적, doSync에서 변경분만 전송, 디바운스 3초 |
| `src/utils/syncEngine.ts` | `syncChanges(changes, projectId)` 새 함수 — full diff 대신 변경분만 처리, RPC 호출 |
| `supabase/migrations/004_batch_upsert.sql` | batch_upsert_records RPC 함수 |

## API 호출 비교

| 시나리오 | 현재 | 개선 후 |
|----------|------|---------|
| 1건 수정 | fetch + 1 UPDATE = 2 | 1 RPC = 1 |
| 50건 수정 | fetch + 50 UPDATE = 51 | 1 RPC = 1 |
| 5건 추가 | fetch + 1 INSERT = 2 | 1 INSERT = 1 |
| 3건 삭제 | fetch + 1 soft DELETE = 2 | 1 soft DELETE = 1 |
| 혼합 | fetch + N UPDATE + INSERT + DELETE | 최대 3 |

## 검증
1. `npx tsc -b` 빌드 통과
2. 레코드 편집 → 변경된 건만 서버 반영 확인 (Supabase 로그)
3. 행 추가/삭제 → 정상 동작
4. 오프라인 → 온라인 복귀 시 정상 sync
5. 기존 empty array guard 유지 확인
