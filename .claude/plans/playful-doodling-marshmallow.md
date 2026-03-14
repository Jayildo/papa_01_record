# 수종 선택 UI + 위치 입력 UX 개선 계획

## Context
모바일 현장 입력 시나리오에서 두 가지 UX 개선 요청:
1. **수종**: 드롭다운(select) 대신 낙엽수/상록수 토글 버튼으로 변경 + 미선택 시 시각적 경고
2. **위치**: 자유 입력 + 기존 입력값 목록에서 선택 가능한 콤보박스 방식

## 변경 사항

### 1. 수종 — 토글 버튼 + 미선택 상태

**타입 변경** (`src/types.ts`):
- `species: '낙엽수' | '상록수'` → `species: '낙엽수' | '상록수' | ''`
- 신규 행 생성 시 기본값을 `''`(미선택)으로 변경

**UI** (`src/components/InputTab.tsx`):
- `<select>` → 두 개의 버튼을 나란히 배치
  - `[낙엽수]` `[상록수]` — 선택된 쪽에 배경색 강조 (낙엽수: green, 상록수: blue)
  - 미선택: 둘 다 회색 outline 상태
- 미선택 상태 카드에 빨간 테두리 또는 "수종을 선택하세요" 경고 텍스트 표시
- 데스크톱 테이블에서도 동일하게 토글 버튼 적용

**집계 영향** (`src/utils/aggregate.ts`, `src/components/ResultTab.tsx`):
- `aggregate()`는 이미 `r.diameter > 0 && r.location.trim()` 필터를 거친 validRecords만 받음
- ResultTab에서 추가로 `species !== ''` 필터 적용하여 미선택 레코드 제외

### 2. 위치 — 콤보박스 (자유 입력 + 기존값 목록)

**UI** (`src/components/InputTab.tsx`):
- 위치 input을 클릭/포커스하면 기존에 입력된 위치 목록을 드롭다운으로 표시
- 목록에서 선택하면 해당 값 채움, 직접 타이핑도 가능
- 입력 중 필터링: 타이핑한 텍스트로 목록 필터
- 모바일 최적화: 드롭다운 항목을 충분히 크게 (44px 이상 터치 타겟)
- 기존 위치 목록은 records에서 중복 제거하여 순서대로 추출 (별도 state 불필요)

**구현 방식**:
- 별도 컴포넌트 `LocationComboBox.tsx` 생성하여 재사용
- props: `value`, `onChange`, `suggestions: string[]`
- 내부 state: `isOpen` (드롭다운 열림), `filter` (필터 텍스트)
- 외부 클릭 시 드롭다운 닫기 (useRef + useEffect)

## 수정 파일
1. `src/types.ts` — species 타입에 `''` 추가
2. `src/components/LocationComboBox.tsx` — 새 컴포넌트 (위치 콤보박스)
3. `src/components/InputTab.tsx` — 수종 토글 버튼, LocationComboBox 적용, 미선택 경고
4. `src/components/ResultTab.tsx` — species 빈값 필터 추가
5. `src/App.tsx` — 신규 행 species 기본값 `''`로 변경

## 검증
- `npm run dev`로 로컬 실행
- 모바일 뷰포트에서: 수종 토글 버튼 터치 → 선택 확인
- 미선택 행 시각적 경고 확인
- 위치 입력란 포커스 → 기존 위치 목록 표시 확인
- 목록에서 선택 + 직접 타이핑 모두 동작 확인
- 결과 탭에서 미선택 수종 레코드 제외 확인
- `npx tsc --noEmit` 타입 체크 통과
