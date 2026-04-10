# 근로내용확인신고서 PDF 매핑

기준 양식:
- `example/[별지 제22호의7서식] (고용보험¸ 산재보험) 근로내용 확인신고서(일용근로자)(고용보험 및 산업재해보상보험의 보험료징수 등에 관한 법률 시행규칙) (1).pdf`
- 앱 템플릿 자산: `src/assets/labor-report-template.pdf`

## 공통 상단 영역

| PDF 항목 | 앱 데이터 |
| --- | --- |
| 사업장관리번호 | `meta.workplaceManagementNumber` |
| 명칭 | `meta.companyName` |
| 사업자등록번호 | `meta.businessRegistrationNumber` |
| 전화번호 | `meta.companyPhone` |
| 공사명 | `meta.siteName` |
| 현장책임자 | `meta.managerName` |
| 대표자 | `meta.representativeName` |
| 사업장소재지 | `meta.companyAddress` |
| 귀속연월(연) | `meta.workYear` |
| 귀속연월(월) | `meta.workMonth` |
| 쪽번호 | PDF 생성 시 packet number / packet count |

## 근로자 반복 영역

한 페이지당 4명씩 배치한다.

| PDF 항목 | 앱 데이터 |
| --- | --- |
| 성명 | `worker.name` |
| 주민등록번호 | `worker.residentId` |
| 직종 | `worker.jobType` |
| 주소 | `worker.address` |
| 전화번호 | `worker.phone` |
| 근로일수 | `reportRow.workedDayCount` |
| 보수총액 | `ledger.grossPay` |
| 소득세 | `ledger.incomeTax` |
| 지방소득세 | `ledger.localIncomeTax` |
| 고용보험 | `ledger.employmentInsurance` |
| 건강보험 | `ledger.healthInsurance` |
| 국민연금 | `ledger.nationalPension` |
| 장기요양 | `ledger.longTermCare` |
| 1~31 근로표시 | `reportRow.workedDays` |

## 하단 서명 영역

| PDF 항목 | 앱 데이터 |
| --- | --- |
| 신고일 연/월/일 | `meta.paymentDate` |
| 대표자 성명 | `meta.representativeName` |

## 앱에서 필수로 요구하는 값

회사정보:
- 회사명
- 현장명
- 현장책임자
- 사업장관리번호
- 사업자등록번호
- 대표자명
- 회사 전화번호
- 지급일
- 회사 주소

근로자:
- 이름
- 주민번호
- 연락처
- 주소
- 직종
- 일급

노무입력:
- 해당 월의 실제 근로일 체크

## 비고

- `접수번호`, `접수일`, `처리기간`은 기관 접수영역이므로 앱에서 채우지 않는다.
- 현재 앱은 공식 PDF 원본 위에 좌표 오버레이로 값을 찍는다.
- 값이 비어 있으면 PDF 미리보기와 인쇄를 막고, 누락 필드 목록을 먼저 표시한다.
