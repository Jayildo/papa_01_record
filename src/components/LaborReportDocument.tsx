import { Fragment } from 'react';
import qrImage from '../assets/labor-report-qr.png';
import type { LaborEntry, LaborProjectMeta, LaborWorker } from '../laborTypes';
import { formatCurrency } from '../utils/labor';

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

type ReportRow = {
  worker: LaborWorker;
  ledger?: LedgerRow;
  workedDays: number[];
  workedDayCount: number;
  missingFields: string[];
};

function hasWork(entries: LaborEntry[], workerId: string, day: number) {
  return (entries.find((entry) => entry.workerId === workerId && entry.day === day)?.units ?? 0) > 0;
}

function chunkRows(rows: ReportRow[], size: number) {
  const chunks: ReportRow[][] = [];
  for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size));
  return chunks.length > 0 ? chunks : [[]];
}

function WorkerSummary({ row }: { row?: ReportRow }) {
  return (
    <table className="labor-report-block">
      <tbody>
        <tr><th>성명</th><td>{row?.worker.name || ''}</td></tr>
        <tr><th>주민등록번호</th><td>{row?.worker.residentId || ''}</td></tr>
        <tr><th>직종</th><td>{row?.worker.jobType || ''}</td></tr>
        <tr><th>주소</th><td>{row?.worker.address || ''}</td></tr>
        <tr><th>전화번호</th><td>{row?.worker.phone || ''}</td></tr>
        <tr><th>근로일수</th><td>{row?.workedDayCount ? `${row.workedDayCount}일` : ''}</td></tr>
        <tr><th>보수총액</th><td>{row?.ledger?.grossPay ? formatCurrency(row.ledger.grossPay) : ''}</td></tr>
        <tr><th>소득세</th><td>{row?.ledger?.incomeTax ? formatCurrency(row.ledger.incomeTax) : ''}</td></tr>
        <tr><th>지방세</th><td>{row?.ledger?.localIncomeTax ? formatCurrency(row.ledger.localIncomeTax) : ''}</td></tr>
        <tr><th>고용보험</th><td>{row?.ledger?.employmentInsurance ? formatCurrency(row.ledger.employmentInsurance) : ''}</td></tr>
        <tr><th>건강보험</th><td>{row?.ledger?.healthInsurance ? formatCurrency(row.ledger.healthInsurance) : ''}</td></tr>
        <tr><th>국민연금</th><td>{row?.ledger?.nationalPension ? formatCurrency(row.ledger.nationalPension) : ''}</td></tr>
        <tr><th>장기요양</th><td>{row?.ledger?.longTermCare ? formatCurrency(row.ledger.longTermCare) : ''}</td></tr>
      </tbody>
    </table>
  );
}

function WorkerDays({
  row,
  entries,
}: {
  row?: ReportRow;
  entries: LaborEntry[];
}) {
  const days = Array.from({ length: 31 }, (_, index) => index + 1);
  const dayChunks = Array.from({ length: Math.ceil(days.length / 7) }, (_, index) =>
    days.slice(index * 7, index * 7 + 7),
  );

  return (
    <table className="labor-report-days">
      <tbody>
        {dayChunks.map((chunk, chunkIndex) => (
          <Fragment key={chunkIndex}>
            <tr>
              {chunkIndex === 0 && (
                <th className="day-head day-merged" rowSpan={dayChunks.length * 2}>
                  <div className="day-merged-grid">
                    <div className="day-merged-label date">일자</div>
                    <div className="day-merged-label work">근로일수</div>
                  </div>
                </th>
              )}
              {chunk.map((day) => (
                <th key={day} className="day-number"><span>{day}</span></th>
              ))}
              {Array.from({ length: 7 - chunk.length }, (_, fillerIndex) => (
                <th key={`day-filler-${chunkIndex}-${fillerIndex}`} className="day-number"><span></span></th>
              ))}
            </tr>
            <tr>
              {chunk.map((day) => (
                <td key={day} className="day-cell"><span>{row && hasWork(entries, row.worker.id, day) ? '○' : ''}</span></td>
              ))}
              {Array.from({ length: 7 - chunk.length }, (_, fillerIndex) => (
                <td key={`work-filler-${chunkIndex}-${fillerIndex}`} className="day-cell"><span></span></td>
              ))}
            </tr>
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

export default function LaborReportDocument({
  meta,
  reportRows,
  entries,
}: {
  meta: LaborProjectMeta;
  reportRows: ReportRow[];
  entries: LaborEntry[];
}) {
  const pages = chunkRows(reportRows, 4);

  return (
    <div className="space-y-4 bg-stone-100 p-4">
      <style>{`
        .labor-report-page {
          width: 185mm;
          min-height: 297mm;
          margin: 0 auto;
          background: #fff;
          border: 1px solid #cbd5e1;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
          padding: 7mm 6mm;
          font-family: 'Malgun Gothic', sans-serif;
          color: #111827;
        }
        .labor-report-caption {
          font-size: 8px;
          line-height: 1.2;
        }
        .labor-report-title {
          text-align: center;
          font-size: 12px;
          font-weight: 700;
          margin: 2px 0 4px;
        }
        .labor-report-meta,
        .labor-report-receipt,
        .labor-report-grid,
        .labor-report-bottom,
        .labor-report-footer {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .labor-report-meta td,
        .labor-report-receipt td,
        .labor-report-grid td,
        .labor-report-bottom td,
        .labor-report-footer td {
          border: 1px solid #111827;
          font-size: 9px;
          line-height: 1.25;
          padding: 3px 4px;
          text-align: center;
          vertical-align: middle;
          word-break: break-word;
          white-space: normal;
        }
        .labor-report-receipt td {
          font-size: 9px;
          padding: 4px 4px;
        }
        .labor-report-grid > tbody > tr > td {
          padding: 0;
          vertical-align: top;
        }
        .labor-report-worker {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .labor-report-block,
        .labor-report-days {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .labor-report-block th,
        .labor-report-block td,
        .labor-report-days th,
        .labor-report-days td {
          border: 1px solid #94a3b8;
          font-size: 7px;
          line-height: 1.15;
          padding: 2px 2px;
          text-align: center;
          word-break: break-word;
          white-space: normal;
          vertical-align: middle;
        }
        .labor-report-block th:first-child,
        .labor-report-block td:first-child,
        .labor-report-days th:first-child,
        .labor-report-days td:first-child {
          width: 35%;
        }
        .labor-report-days .day-head {
          background: #f8fafc;
          font-weight: 700;
        }
        .labor-report-days .day-merged {
          width: 35%;
          vertical-align: top;
          padding: 0;
        }
        .labor-report-days .day-merged-grid {
          display: grid;
          grid-template-rows: repeat(10, 24px);
          height: 100%;
        }
        .labor-report-days .day-merged-label {
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
        }
        .labor-report-days .day-merged-label.date {
          grid-row: 3;
        }
        .labor-report-days .day-merged-label.work {
          grid-row: 8;
        }
        .labor-report-days .day-number,
        .labor-report-days .day-cell {
          width: 11.1%;
          padding: 0;
          height: 24px;
          vertical-align: middle;
        }
        .labor-report-days .day-number > span,
        .labor-report-days .day-cell > span {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 24px;
        }
        .labor-report-qr-box {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 72px;
        }
        .labor-report-qr-box img {
          max-width: 58px;
          max-height: 58px;
          object-fit: contain;
        }
      `}</style>

      {pages.map((pageRows, pageIndex) => (
        <section key={pageIndex} className="labor-report-page">
          <div className="labor-report-caption">[별지 제22호의7서식] [사업장별 근로내용 확인신고서] ({meta.workYear}년 {meta.workMonth}월분) ({pages.length}쪽 중 {pageIndex + 1}쪽)</div>
          <div className="labor-report-title">근로내용 확인신고서</div>

          <table className="labor-report-receipt" style={{ marginBottom: '3px' }}>
            <tbody>
              <tr>
                <td style={{ width: '16%' }}>접수번호</td>
                <td style={{ width: '22%' }}></td>
                <td style={{ width: '16%' }}>접수일</td>
                <td style={{ width: '22%' }}></td>
                <td style={{ width: '12%' }}>처리기간</td>
                <td style={{ width: '12%' }}>즉시</td>
              </tr>
            </tbody>
          </table>

          <table className="labor-report-meta">
            <tbody>
              <tr>
                <td style={{ width: '12%' }}>사업장관리번호</td>
                <td style={{ width: '14%' }}>{meta.workplaceManagementNumber || ''}</td>
                <td style={{ width: '10%' }}>명칭</td>
                <td style={{ width: '16%' }}>{meta.companyName || ''}</td>
                <td style={{ width: '12%' }}>사업자등록번호</td>
                <td style={{ width: '14%' }}>{meta.businessRegistrationNumber || ''}</td>
                <td style={{ width: '10%' }}>전화번호</td>
                <td style={{ width: '12%' }}>{meta.companyPhone || ''}</td>
              </tr>
              <tr>
                <td>공사명</td>
                <td>{meta.siteName || ''}</td>
                <td>현장책임자</td>
                <td>{meta.managerName || ''}</td>
                <td>대표자</td>
                <td>{meta.representativeName || ''}</td>
                <td>사업장소재지</td>
                <td>{meta.companyAddress || ''}</td>
              </tr>
            </tbody>
          </table>

          <table className="labor-report-grid" style={{ marginTop: '3px' }}>
            <tbody>
              <tr>
                {Array.from({ length: 4 }, (_, index) => (
                  <td key={index} style={{ width: '25%' }}>
                    <div className="labor-report-worker">
                      <WorkerSummary row={pageRows[index]} />
                      <WorkerDays row={pageRows[index]} entries={entries} />
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>

          <table className="labor-report-bottom" style={{ marginTop: '4px' }}>
            <tbody>
              <tr>
                <td style={{ width: '16%' }}>
                  <div className="labor-report-qr-box">
                    <img src={qrImage} alt="QR 확인영역" />
                  </div>
                </td>
                <td style={{ width: '58%', textAlign: 'left', paddingLeft: '6px' }}>
                  신고 내용이 사실과 다름이 없음을 확인합니다. 허위 신고 시 관련 법령에 따른 책임이 있을 수 있습니다.
                  <br />
                  건설현장 일용근로자의 경우 동일 월 내 중복 신고 여부를 다시 확인해 주십시오.
                </td>
                <td style={{ width: '26%' }}>
                  {meta.workYear}년 {meta.workMonth}월
                  <br />
                  사업주 서명(인)
                </td>
              </tr>
            </tbody>
          </table>

          <table className="labor-report-footer" style={{ marginTop: '3px' }}>
            <tbody>
              <tr>
                <td style={{ width: '65%' }}>수신처: 근로복지공단 / 고용센터</td>
                <td style={{ width: '35%' }}>제 {pageIndex + 1} 쪽</td>
              </tr>
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
