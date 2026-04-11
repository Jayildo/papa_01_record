import { Fragment } from 'react';
import { formatCurrency } from '../utils/labor';
import type { LaborEntry, LaborResolvedMeta, LaborWorker } from '../laborTypes';

type LedgerRow = {
  worker: LaborWorker;
  totalUnits: number;
  totalDays: number;
  grossPay: number;
  incomeTax: number;
  localIncomeTax: number;
  employmentInsurance: number;
  nationalPension: number;
  healthInsurance: number;
  longTermCare: number;
  otherDeduction: number;
  totalDeduction: number;
  netPay: number;
  notes: string[];
};

function getEntryUnits(entries: LaborEntry[], workerId: string, day: number): number {
  return entries.find((entry) => entry.workerId === workerId && entry.day === day)?.units ?? 0;
}

function formatDayCell(units: number) {
  if (!units) return '';
  return Number.isInteger(units) ? String(units) : units.toFixed(1);
}

function getStackedDayPairs(): { topDay: number | null; bottomDay: number | null }[] {
  // 16 pairs: (1,16),(2,17),...,(15,30),(null,31)
  return Array.from({ length: 16 }, (_, index) => ({
    topDay: index < 15 ? index + 1 : null,
    bottomDay: index + 16 <= 31 ? index + 16 : null,
  }));
}

export default function LaborLedgerDocument({
  meta,
  ledgerRows,
  totals,
  entries,
}: {
  meta: LaborResolvedMeta;
  ledgerRows: LedgerRow[];
  totals: {
    totalUnits: number;
    grossPay: number;
    incomeTax: number;
    localIncomeTax: number;
    employmentInsurance: number;
    nationalPension: number;
    healthInsurance: number;
    longTermCare: number;
    otherDeduction: number;
    totalDeduction: number;
    netPay: number;
  };
  entries: LaborEntry[];
}) {
  const dayPairs = getStackedDayPairs();

  return (
    <div className="space-y-6 bg-stone-100 p-4">
      <style>{`
        .labor-ledger-page {
          width: 297mm;
          min-height: 210mm;
          margin: 0 auto;
          background: #fff;
          border: 1px solid #cbd5e1;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
          padding: 4mm;
          overflow: hidden;
          font-family: 'Malgun Gothic', sans-serif;
          color: #111827;
        }
        .labor-ledger-table,
        .labor-ledger-meta {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .labor-ledger-table th,
        .labor-ledger-table td,
        .labor-ledger-meta td {
          border: 1px solid #111827;
          padding: 1px 2px;
          font-size: 8px;
          line-height: 1.1;
          word-break: keep-all;
          text-align: center;
        }
        .labor-ledger-meta td {
          font-size: 8px;
          padding: 1px 2px;
        }
        .labor-ledger-head {
          font-size: 16px;
          font-weight: 700;
          text-align: center;
          letter-spacing: 0.04em;
        }
        .labor-ledger-blue {
          background: #22a6db;
          color: #0f172a;
          font-weight: 700;
        }
        .labor-ledger-yellow {
          background: #ffef45;
          font-weight: 700;
        }
        .labor-ledger-gray {
          background: #f8fafc;
        }
        .labor-ledger-warn {
          color: #dc2626;
          font-weight: 700;
          font-size: 8px;
          line-height: 1.25;
          text-align: left !important;
          padding-left: 4px !important;
        }
        .labor-ledger-left { text-align: left !important; }
        .labor-ledger-right { text-align: right !important; padding-right: 4px !important; }
        .labor-ledger-tiny { font-size: 7px !important; }
        .labor-ledger-split {
          padding: 0 !important;
        }
        .labor-ledger-split > div {
          min-height: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .labor-ledger-split > div + div {
          border-top: 1px solid #111827;
        }
        .labor-ledger-footer {
          margin-top: 3px;
          display: flex;
          justify-content: space-between;
          gap: 8px;
          font-size: 6px;
          line-height: 1.15;
        }
      `}</style>

      <section className="labor-ledger-page">
        <div className="labor-ledger-head" style={{ marginBottom: '2px' }}>
          {meta.workYear} 년 {meta.workMonth} 월 노무비 지급대장
        </div>
        <table className="labor-ledger-meta" style={{ marginBottom: '2px' }}>
          <tbody>
            <tr>
              <td style={{ width: '12%' }}>회사명</td>
              <td style={{ width: '22%' }}>{meta.companyName || '-'}</td>
              <td style={{ width: '10%' }}>현장명</td>
              <td style={{ width: '22%' }}>{meta.siteName || '-'}</td>
              <td style={{ width: '10%' }}>기간</td>
              <td style={{ width: '24%' }}>
                {meta.workYear}년 {meta.workMonth}월 1일 부터 ~
                {meta.workYear}년 {meta.workMonth}월 31일 까지
              </td>
            </tr>
            <tr>
              <td>현장책임자</td>
              <td>{meta.managerName || '-'}</td>
              <td>관리번호</td>
              <td>{meta.workplaceManagementNumber || '-'}</td>
              <td className="labor-ledger-warn" colSpan={3}>
                주민번호 입력시 "-"를 입력해 주시기 바랍니다. (예: 701111-2XXXXXX)
                <br />
                이 엑셀은 참고용으로 최종 공제금액은 반드시 검토가 필요합니다.
              </td>
            </tr>
          </tbody>
        </table>

        {/* Column order: NO | 오류 | 성명 | 주민번호 | 주소 | 일당 | [16 stacked day cols] | 총공수 | 일수 | 노무비총액 | 고용/갑근 | 건강/주민 | 국민/장기 | 공제합계 | 차감지급액 | 비고 */}
        <table className="labor-ledger-table">
          <thead>
            {/* Row 0: tall headers + "일자" colspan + tall summary + 3 split deduction headers + tall end headers */}
            <tr>
              <th rowSpan={2} style={{ width: '2%' }}>NO.</th>
              <th rowSpan={2} style={{ width: '3%' }}>오류</th>
              <th rowSpan={2} className="labor-ledger-blue" style={{ width: '4%' }}>성명</th>
              <th rowSpan={2} className="labor-ledger-blue" style={{ width: '8%' }}>주민번호</th>
              <th rowSpan={2} className="labor-ledger-blue" style={{ width: '14%' }}>주소</th>
              <th rowSpan={2} className="labor-ledger-blue" style={{ width: '5%' }}>일당</th>
              <th colSpan={16} className="labor-ledger-gray">일자</th>
              <th rowSpan={2} className="labor-ledger-blue" style={{ width: '3%' }}>총공수</th>
              <th rowSpan={2} className="labor-ledger-blue" style={{ width: '3%' }}>일수</th>
              <th rowSpan={2} className="labor-ledger-blue" style={{ width: '6%' }}>노무비총액</th>
              {/* 3 stacked deduction headers — rowSpan=2, split layout shows 2 labels per cell */}
              <th rowSpan={2} className="labor-ledger-blue labor-ledger-split" style={{ width: '5%' }}>
                <div>고용보험</div>
                <div>갑근세</div>
              </th>
              <th rowSpan={2} className="labor-ledger-blue labor-ledger-split" style={{ width: '5%' }}>
                <div>건강보험</div>
                <div>주민세</div>
              </th>
              <th rowSpan={2} className="labor-ledger-blue labor-ledger-split" style={{ width: '5%' }}>
                <div>국민연금</div>
                <div>장기요양보험료</div>
              </th>
              <th rowSpan={2} className="labor-ledger-blue" style={{ width: '5%' }}>공제합계</th>
              <th rowSpan={2} className="labor-ledger-blue" style={{ width: '6%' }}>차감지급액</th>
              <th rowSpan={2} className="labor-ledger-blue" style={{ width: '3%' }}>비고</th>
            </tr>
            {/* Row 1: only the 16 day pair cells */}
            <tr>
              {dayPairs.map(({ topDay, bottomDay }, index) => (
                <th key={`day-pair-${index}`} className="labor-ledger-yellow labor-ledger-tiny labor-ledger-split">
                  <div>{topDay !== null ? topDay : '※'}</div>
                  <div>{bottomDay !== null ? bottomDay : ''}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ledgerRows.map((row, index) => (
              <Fragment key={row.worker.id}>
                <tr>
                  <td>{index + 1}</td>
                  <td></td>
                  <td>{row.worker.name || '-'}</td>
                  <td>{row.worker.residentId || '-'}</td>
                  <td className="labor-ledger-left">{row.worker.address || '-'}</td>
                  <td className="labor-ledger-right">{row.worker.dailyWage ? formatCurrency(row.worker.dailyWage) : '-'}</td>
                  {dayPairs.map(({ topDay, bottomDay }, pairIndex) => (
                    <td key={`${row.worker.id}-pair-${pairIndex}`} className="labor-ledger-tiny labor-ledger-split">
                      <div>{topDay !== null ? formatDayCell(getEntryUnits(entries, row.worker.id, topDay)) : ''}</div>
                      <div>{bottomDay !== null ? formatDayCell(getEntryUnits(entries, row.worker.id, bottomDay)) : ''}</div>
                    </td>
                  ))}
                  <td>{row.totalUnits || ''}</td>
                  <td>{row.totalDays || ''}</td>
                  <td className="labor-ledger-right">{row.grossPay ? formatCurrency(row.grossPay) : '-'}</td>
                  {/* 3 stacked deduction cells */}
                  <td className="labor-ledger-tiny labor-ledger-split">
                    <div className="labor-ledger-right">{row.employmentInsurance ? formatCurrency(row.employmentInsurance) : ''}</div>
                    <div className="labor-ledger-right">{row.incomeTax ? formatCurrency(row.incomeTax) : ''}</div>
                  </td>
                  <td className="labor-ledger-tiny labor-ledger-split">
                    <div className="labor-ledger-right">{row.healthInsurance ? formatCurrency(row.healthInsurance) : ''}</div>
                    <div className="labor-ledger-right">{row.localIncomeTax ? formatCurrency(row.localIncomeTax) : ''}</div>
                  </td>
                  <td className="labor-ledger-tiny labor-ledger-split">
                    <div className="labor-ledger-right">{row.nationalPension ? formatCurrency(row.nationalPension) : ''}</div>
                    <div className="labor-ledger-right">{row.longTermCare ? formatCurrency(row.longTermCare) : ''}</div>
                  </td>
                  <td className="labor-ledger-right">{row.totalDeduction ? formatCurrency(row.totalDeduction) : '-'}</td>
                  <td className="labor-ledger-right">{row.netPay ? formatCurrency(row.netPay) : '-'}</td>
                  <td></td>
                </tr>
              </Fragment>
            ))}
            {Array.from({ length: Math.max(0, 10 - ledgerRows.length) }, (_, fillerIndex) => (
              <tr key={`filler-${fillerIndex}`}>
                <td>{ledgerRows.length + fillerIndex + 1}</td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                <td></td>
                {dayPairs.map((_, pairIndex) => (
                  <td key={`f-${fillerIndex}-${pairIndex}`} className="labor-ledger-tiny labor-ledger-split">
                    <div></div>
                    <div></div>
                  </td>
                ))}
                <td></td>
                <td></td>
                <td></td>
                {/* 3 stacked deduction cells */}
                <td className="labor-ledger-tiny labor-ledger-split">
                  <div></div>
                  <div></div>
                </td>
                <td className="labor-ledger-tiny labor-ledger-split">
                  <div></div>
                  <div></div>
                </td>
                <td className="labor-ledger-tiny labor-ledger-split">
                  <div></div>
                  <div></div>
                </td>
                <td></td>
                <td></td>
                <td></td>
              </tr>
            ))}
            <tr className="labor-ledger-gray">
              {/* colSpan=22: NO(1) + 오류(1) + 성명(1) + 주민번호(1) + 주소(1) + 일당(1) + 16 day cols = 22 */}
              <td colSpan={22} className="labor-ledger-left" style={{ paddingLeft: '4px' }}>합계</td>
              <td>{totals.totalUnits || ''}</td>
              <td></td>
              <td className="labor-ledger-right">{totals.grossPay ? formatCurrency(totals.grossPay) : '-'}</td>
              {/* 3 stacked deduction totals */}
              <td className="labor-ledger-tiny labor-ledger-split">
                <div className="labor-ledger-right">{totals.employmentInsurance ? formatCurrency(totals.employmentInsurance) : ''}</div>
                <div className="labor-ledger-right">{totals.incomeTax ? formatCurrency(totals.incomeTax) : ''}</div>
              </td>
              <td className="labor-ledger-tiny labor-ledger-split">
                <div className="labor-ledger-right">{totals.healthInsurance ? formatCurrency(totals.healthInsurance) : ''}</div>
                <div className="labor-ledger-right">{totals.localIncomeTax ? formatCurrency(totals.localIncomeTax) : ''}</div>
              </td>
              <td className="labor-ledger-tiny labor-ledger-split">
                <div className="labor-ledger-right">{totals.nationalPension ? formatCurrency(totals.nationalPension) : ''}</div>
                <div className="labor-ledger-right">{totals.longTermCare ? formatCurrency(totals.longTermCare) : ''}</div>
              </td>
              <td className="labor-ledger-right">{totals.totalDeduction ? formatCurrency(totals.totalDeduction) : '-'}</td>
              <td className="labor-ledger-right">{totals.netPay ? formatCurrency(totals.netPay) : '-'}</td>
              <td></td>
            </tr>
          </tbody>
        </table>

        <div className="labor-ledger-footer">
          <div>노무비대장 입력 자료는 노무입력 탭의 공수 데이터를 기준으로 산출됩니다.</div>
          <div>작성 / 검토 / 승인</div>
        </div>
      </section>
    </div>
  );
}
