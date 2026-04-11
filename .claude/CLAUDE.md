# papa_01_record - 수목 전정 현황

## 개요
수목 전정(가지치기) 작업 데이터를 현장에서 입력하고, 위치×수종×직경별 집계표를 생성하는 모바일 우선 웹앱.

## 기술 스택
- React 19 + TypeScript 5.9 (strict)
- Vite 7 + Tailwind CSS 4
- Supabase (DB + Auth 대용 PIN)
- html2canvas-pro (이미지 캡처) + jsPDF (PDF 생성)
- 배포: Vercel (main push → 자동 배포)

## 디렉토리 구조
```
src/
├── main.tsx              # 엔트리
├── App.tsx               # 루트: 프로젝트 CRUD, 탭 관리, 다크모드, Supabase 동기화
├── types.ts              # TreeRecord, Project, DiameterRange 등 타입/상수
├── index.css             # Tailwind import + 다크모드
├── lib/supabase.ts       # Supabase 클라이언트
├── utils/aggregate.ts    # 피벗 집계 로직 (위치×수종×직경 → 카운트)
└── components/
    ├── PinScreen.tsx         # PIN 인증 화면
    ├── InputTab.tsx          # 입력탭: 모바일 카드/데스크톱 테이블, PNG/PDF/공유 내보내기
    ├── ResultTab.tsx         # 결과탭: 집계표, 핀치줌, PNG/PDF/공유 내보내기
    ├── LocationComboBox.tsx  # 위치 자동완성 콤보박스
    ├── WorklogWorkbench.tsx  # 작업일지 워크스페이스 (서브탭 컨테이너)
    ├── WorklogInput.tsx      # 작업일지 입력 폼 (헤더 + 인력 + 장비/자재)
    ├── WorklogMonthly.tsx    # 월별 통계 (카드 + Top N 현장 + 일자별 드릴다운)
    └── WorklogImport.tsx     # CSV 업로드 UI (파싱 미리보기 + 가져오기)

scripts/
└── importWorklogCsv.ts   # 일회성 CSV 이관 스크립트 (npx tsx scripts/importWorklogCsv.ts [--commit])

supabase/migrations/014_worklog_base.sql  # work_logs, work_log_laborers, work_log_items + RLS
src/lib/worklogSupabase.ts               # fetch/upsert/delete/bulkImport
src/utils/worklogCsvParser.ts            # CSV → WorkLog[] (수작업 파서, 외부 의존성 없음)
src/utils/worklogStats.ts                # computeMonthlyStats, listMonths 순수 함수
```

## 주요 패턴

### 내보내기 (PNG/PDF/공유)
- `captureTable()`: html2canvas로 테이블 DOM → canvas 캡처 (scale:2, 다크모드 해제 후 복원)
- PNG: canvas → dataURL → download
- PDF: **tbody tr display 숨김 방식** — 50행씩만 보이게 하고 페이지별 html2canvas 캡처 → 행 잘림 없음, 매 페이지 thead 포함
- 공유: Web Share API → clipboard → download 폴백 체인

### 핀치줌 (ResultTab)
- `touch-pan-x touch-pan-y`로 한 손가락 드래그 패닝 허용
- 두 손가락 핀치: `touchstart`/`touchmove` 리스너에서 `e.touches.length === 2`일 때만 preventDefault + 줌 계산
- 줌 범위 20~200%, 버튼 줌 30% 단위

### 데이터 동기화
- 레코드 변경 시 1.5초 디바운스 후 Supabase upsert
- 프로젝트 단위 CRUD

## 알려진 이슈
- PIN이 클라이언트 코드에 하드코딩 (PinScreen.tsx) — 보안 취약
- aggregate() 함수 내 빈 종명('') 입력 시 크래시 가능성
- Supabase 환경변수 미검증 (as string 단언)
- Supabase 쿼리 에러 처리 미흡 (silent fail)
- captureTable에서 에러 시 zoom/다크모드 복원 누락 위험
- 접근성(ARIA) 미구현

## 빌드
```bash
npm run build   # tsc -b && vite build
npm run dev     # vite dev server
```

## 백업/복구 운영 가이드

### 3층 방어선

| 레이어 | 위치 | 주기 |
|--------|------|------|
| Layer 1 — DB 내부 history 테이블 | `work_log_history` (015 마이그레이션) | 모든 변경 자동 기록 |
| Layer 2 — Vercel Cron → Blob | `api/backup-daily.ts` (UTC 18:00 = KST 03:00) | 매일 자동 (Blob 활성화 필요) |
| Layer 3 — 로컬 수동/자동 백업 | `backups/YYYY-MM-DD/` | 수동 또는 Windows 작업 스케줄러 |

### 운영 명령어

```bash
npm run backup              # 로컬 전체 덤프 (12개 테이블 + sha256)
npm run verify-integrity    # 최근 백업 vs 현재 DB 해시 비교
npx tsx scripts/runMigration.ts supabase/migrations/<file>.sql  # 마이그레이션 적용
```

### 특정 레코드 복원
```bash
# dry-run (diff만 출력)
npx tsx scripts/restoreFromBackup.ts --table work_logs --id <uuid>

# 실제 복원
npx tsx scripts/restoreFromBackup.ts --table work_logs --id <uuid> --commit

# 특정 날짜 백업 폴더 지정
npx tsx scripts/restoreFromBackup.ts backups/2026-04-11 --table work_logs --id <uuid>
```

### 복구 우선순위
1. DB history 테이블 → `work_log_history`에서 old_data jsonb로 행별 복구
2. 최근 Blob 백업 → Vercel 대시보드에서 `backups/YYYY-MM-DD.json.gz` 다운로드
3. 로컬 백업 → `backups/YYYY-MM-DD/` JSON 파일에서 `restoreFromBackup.ts --commit`

### Supabase Free 유지 이유
Free tier는 자동 PITR 없음. 대신 015/016 마이그레이션의 `prevent_hard_delete` 트리거 + history 테이블이 내부 최후 방어선 역할. 최악의 경우 하루치 재입력으로 감당 가능한 규모. DB 용량이 Free 한계(500MB)에 접근하거나 분 단위 복구가 실제로 필요한 사건 발생 시 Pro 승격.

### Vercel Blob 활성화 (사용자 작업)
1. Vercel 대시보드 → Storage → Blob store 생성
2. `BLOB_READ_WRITE_TOKEN` 를 Vercel 환경변수에 추가
3. `CRON_SECRET` 환경변수도 Vercel에 추가 (임의 문자열)
4. 로컬 테스트용: `.env` 에도 동일하게 추가

### Windows 작업 스케줄러 등록 (선택)
매일 PC 부팅 시 자동 로컬 백업:
```
작업: node "C:\project\papa_01_record\node_modules\.bin\tsx" scripts/backupAll.ts
조건: 로그온 시 또는 매일 지정 시각
작업 디렉토리: C:\project\papa_01_record
```
