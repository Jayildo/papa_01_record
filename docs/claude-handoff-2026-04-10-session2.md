# Claude Handoff — Session 2

작성일: 2026-04-10
커밋: 54acf48

## 이번 세션에서 한 것

### 신고서 PDF 전면 재설계
- 일자 그리드 7x5 → **5x7** (공식 양식과 일치)
- PDF 내부 텍스트/격자선 프로그래밍 추출 (OCR 대용)
- 근로자 컬럼 경계, 셀 중앙점 자동 계산
- 주민번호 서식 "-" 기준 앞6/뒤7 분리 배치
- 계산 필드 y축을 단위 라벨("원","일","시간") baseline에 정렬
- 4대보험 공제 제거 (신고서에 없음), 소득세/지방소득세만
- 연도 YY + 볼드, 서명부 좌표 교정

### 개발 도구 3개 생성
- `LaborCalibrator.tsx` — 드래그 가능한 좌표 캘리브레이터 UI
- `autoCalibrate.mjs` — PDF 텍스트/격자 자동 추출
- `verifyPdf.mjs` — 오버레이 겹침 자동 검증

### 회사정보 확장
- 휴대전화, 팩스번호, 책임자 주민번호/직위/직무내용 추가 (타입+UI, DB 미반영)

### 근로자 UI 개선
- 카드 접기/펼치기 (수정 버튼으로 토글)
- 주민번호/외국인등록번호 라벨 통합 + 13자리 검증

## 남은 작업

### 신고서 좌표 미세조정
- 전화번호(유선)/휴대전화/FAX → 서식의 3개 칸에 각각 매핑 필요
- 새 필드(휴대전화, FAX, 책임자정보)를 PDF 오버레이에 매핑 (`drawCommonMeta` 확장)
- 헤더 영역 복잡한 행(대표자 성/주민번호/직위, 근무지 체크박스 등) 아직 미구현

### DB 마이그레이션
- 새 필드 6개 (`company_phone_mobile`, `company_fax`, `manager_resident_id`, `manager_title`, `manager_job_description`) Supabase 컬럼 추가 필요
- `laborSupabase.ts`의 `saveLaborProjectBundle`에도 새 필드 write 로직 추가 필요

### 노무비대장
- ledger-range.png 참조로 컬럼 순서/라벨 정밀화 아직 안 함
- Excel 기준: 고용보험 | 건강보험(갑근세/주민세) | 국민연금 | 장기요양보험료

### 기타
- `test-output.pdf`, `autoCalibrate.mjs`, `verifyPdf.mjs` — 개발 도구, 배포 시 제외 고려
- `LaborCalibrator.tsx` — 개발용 UI, 프로덕션에서 숨김 처리 고려
- `example/` 폴더의 공식 PDF 원본은 gitignore 고려

## 핵심 파일

| 파일 | 상태 |
|------|------|
| `src/utils/laborReportPdf.ts` | 좌표 캘리브레이션 완료 (1차) |
| `src/components/LaborCalibrator.tsx` | 드래그 캘리브레이터 |
| `src/components/LaborWorkbench.tsx` | 회사정보 확장 + 접기UI |
| `src/laborTypes.ts` | 새 필드 6개 추가 |
| `src/lib/laborSupabase.ts` | 매퍼에 ?? 기본값 처리 (DB 컬럼 미추가) |
| `src/utils/labor.ts` | 초기값 빌더 업데이트 |

## 사용자 피드백 (이번 세션)
- 좌표 캘리브레이터 UI가 작업 효율에 큰 도움
- PDF 텍스트 추출(OCR) + 자동 검증 루프 좋음
- 연/월 위치 잡는 데 너무 오래 걸림 → right-align으로 라벨 왼쪽 고정이 정답
- 데이터와 단위 라벨의 y축 baseline 정렬 중요
