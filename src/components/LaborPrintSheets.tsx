import type { LaborEntry, LaborResolvedMeta, LaborWorker } from '../laborTypes';
import LaborLedgerDocument from './LaborLedgerDocument';
import LaborReportDocument from './LaborReportDocument';

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

export default function LaborPrintSheets({
  printMode,
  meta,
  ledgerRows,
  totals,
  reportRows,
  entries,
}: {
  printMode: 'ledger' | 'report' | null;
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
  reportRows: ReportRow[];
  entries: LaborEntry[];
}) {
  return (
    <>
      <style>{`
        .labor-print-host { display: none; }
        @media print {
          @page {
            size: ${printMode === 'ledger' ? 'A4 landscape' : 'A4 portrait'};
            margin: 6mm;
          }
          body * { visibility: hidden; }
          .labor-print-host, .labor-print-host * { visibility: visible; }
          .labor-print-host {
            display: block;
            position: absolute;
            inset: 0;
            background: white;
          }
          .labor-print-host .space-y-6,
          .labor-print-host .space-y-6 > * {
            visibility: visible;
          }
          .labor-print-host .bg-stone-100 {
            background: white !important;
            padding: 0 !important;
          }
          .labor-print-host section {
            box-shadow: none !important;
            border: none !important;
            margin: 0 auto !important;
          }
        }
      `}</style>
      <div className="labor-print-host">
        {printMode === 'ledger' && (
          <LaborLedgerDocument meta={meta} ledgerRows={ledgerRows} totals={totals} entries={entries} />
        )}
        {printMode === 'report' && (
          <LaborReportDocument meta={meta} reportRows={reportRows} entries={entries} />
        )}
      </div>
    </>
  );
}
