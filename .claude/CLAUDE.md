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
