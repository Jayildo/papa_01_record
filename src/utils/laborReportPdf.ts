import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import malgunFontUrl from '../assets/malgun.ttf?url';
import templatePdfUrl from '../assets/labor-report-template.pdf?url';
import type { LaborResolvedMeta, LaborWorker } from '../laborTypes';

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

type AlignMode = 'left' | 'center' | 'right';

type Box = {
  x: number;
  y: number;
  width: number;
  size?: number;
  minSize?: number;
  align?: AlignMode;
  bold?: boolean;
};

const META_BOXES = {
  // Calibrated via interactive tool 2026-04-10
  workplaceManagementNumber: { x: 158, y: 709.4, width: 110, size: 6.5, minSize: 5.4, align: 'center' as const },
  companyName: { x: 386, y: 709.4, width: 150, size: 6.5, minSize: 5.2, align: 'center' as const },
  businessRegistrationNumber: { x: 158.7, y: 698, width: 110, size: 6.5, minSize: 5.4, align: 'center' as const },
  companyAddress: { x: 124.7, y: 658.7, width: 410, size: 5.9, minSize: 4.8, align: 'left' as const },
  companyPhone: { x: 158, y: 640.1, width: 68, size: 6.5, minSize: 5.4, align: 'center' as const },
  representativeName: { x: 193.3, y: 628.7, width: 80, size: 6.2, minSize: 5.2, align: 'center' as const },
  siteName: { x: 388, y: 676.7, width: 150, size: 6.2, minSize: 5.2, align: 'center' as const },
  // Title line: ")(  YY  년     MM  월분  )" — all at y=751.8
  // Year blank: x=445→462 (between ")(" and "년"), Month blank: x=473→496 (between "년" end and "월분")
  // "년" at x=464, "월분" at x=498.5 (y=751.8)
  // right-align so text ends 2pt before each label
  workYear: { x: 442, y: 751.8, width: 20, size: 10.5, minSize: 9, align: 'right' as const, bold: true },
  workMonth: { x: 476, y: 751.8, width: 20, size: 10.5, minSize: 9, align: 'right' as const, bold: true },
  packetNumber: { x: 528, y: 758, width: 12, size: 7, minSize: 6, align: 'center' as const },
  packetCount: { x: 546, y: 758, width: 12, size: 7, minSize: 6, align: 'center' as const },
};

const FOOTER_BOXES = {
  // "년" at x=434.6, "월" at x=475.1, "일" at x=515.4 — all at y=107.8
  // Data right-aligned just before each unit label, same y baseline
  signedYear: { x: 410, y: 107.8, width: 22, size: 8, minSize: 7, align: 'right' as const },
  signedMonth: { x: 455, y: 107.8, width: 18, size: 8, minSize: 7, align: 'right' as const },
  signedDay: { x: 497, y: 107.8, width: 16, size: 8, minSize: 7, align: 'right' as const },
  // Between "신고인(사용자·대표자)" end (x≈240) and "(서명 또는 인)" start (x≈468)
  // Midpoint ≈ 354, center-aligned in that space
  signerName: { x: 391.3, y: 97.5, width: 70, size: 7.2, minSize: 6, align: 'center' as const },
};

// Zone A — Worker Identity (above day grid)
// Calibrated: W1 markers at absolute x≈142.7, column left=133 → relative x≈9.7
const WORKER_IDENTITY_BOXES: Box[] = [
  { x: 9.7, y: 601.8, width: 88, size: 7, minSize: 6, align: 'center' },      // name (성명)
  { x: 9.7, y: 583.1, width: 88, size: 6.5, minSize: 5.5, align: 'center' },  // residentId (주민번호)
  { x: 8.3, y: 547.8, width: 88, size: 6.5, minSize: 5.4, align: 'center' },  // phone (전화번호)
  { x: 9, y: 532.5, width: 88, size: 7, minSize: 5.8, align: 'center' },      // jobType (직종)
];

// Zone C — Calculation fields (below day grid)
// Y positions aligned to unit label baselines from template OCR
// "일" at y=349.4, "원" at y=316.1/301.5/186.4/159.3
const WORKER_CALC_BOXES = {
  dayCount:       { x: 15, y: 349.4, width: 20, size: 6.5, minSize: 5.5, align: 'right' as const },   // "일" at y=349.4
  hours:          { x: 55, y: 350.8, width: 20, size: 6.5, minSize: 5.5, align: 'right' as const },   // "시간" at y≈350.8
  baseDays:       { x: 15, y: 330.9, width: 68, size: 6.5, minSize: 5.5, align: 'right' as const },   // "일" at y=330.9
  grossPay:       { x: 15, y: 316.1, width: 68, size: 6.5, minSize: 5.5, align: 'right' as const },   // "원" at y=316.1
  totalWages:     { x: 15, y: 301.5, width: 68, size: 6.5, minSize: 5.5, align: 'right' as const },   // "원" at y=301.5
  incomeTax:      { x: 15, y: 186.4, width: 68, size: 6.5, minSize: 5.5, align: 'right' as const },   // "원" at y=186.4
  localIncomeTax: { x: 15, y: 159.3, width: 68, size: 6.5, minSize: 5.5, align: 'right' as const },   // "원" at y=159.3
};

const WORKER_COLUMN_LEFT = [133, 231, 331, 429.5];

const DAY_COLS = 5;           // 5 days per row

// Day column LEFT edges relative to worker column left
// W1 cells: 133→152.5→171.5→191→210→231
// Offsets from left: 0, 19.5, 38.5, 58, 77
const DAY_COL_LEFT = [0, 19.5, 38.5, 58, 77];
const DAY_COL_WIDTH = [19.5, 19.0, 19.5, 19.0, 21.0];

// Mark sub-row vertical bounds and centers
// Each day row has: number sub-row (top) + mark sub-row (bottom)
// Mark sub-row bounds: [top, bottom] — O goes vertically centered here
const DAY_MARK_TOP =    [515.5, 492.5, 469.0, 446.0, 422.5, 399.5, 376.0];
const DAY_MARK_BOTTOM = [504.0, 481.0, 457.5, 434.0, 411.0, 387.5, 364.5];

const CIRCLE_MARK = '\u25CB';

function chunkRows<T>(rows: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks.length > 0 ? chunks : [[]];
}

function formatWon(value: number | undefined) {
  if (!value) return '';
  return new Intl.NumberFormat('ko-KR').format(Math.round(value));
}


function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return value;
}

function parsePaymentDate(value: string) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: match[1],
    month: String(Number(match[2])),
    day: String(Number(match[3])),
  };
}

function drawInBox(page: PDFPage, font: PDFFont, text: string, box: Box) {
  if (!text) return;

  let size = box.size ?? 8;
  const minSize = box.minSize ?? Math.min(size, 5.2);
  const maxWidth = Math.max(box.width - 4, 0);

  while (size > minSize && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.2;
  }

  const textWidth = font.widthOfTextAtSize(text, size);
  const align = box.align ?? 'left';
  const x =
    align === 'center'
      ? box.x + Math.max((box.width - textWidth) / 2, 2)
      : align === 'right'
        ? box.x + Math.max(box.width - textWidth - 2, 2)
        : box.x + 2;

  page.drawText(text, { x, y: box.y, size, color: rgb(0, 0, 0), maxWidth });

  // Faux bold: draw again with slight x offset
  if (box.bold) {
    page.drawText(text, { x: x + 0.3, y: box.y, size, color: rgb(0, 0, 0), maxWidth });
  }
}

function drawCommonMeta(page: PDFPage, font: PDFFont, meta: LaborResolvedMeta, packetNumber: number, packetCount: number) {
  // Row 1: 사업장관리번호 | 명칭 | 사업자등록번호
  drawInBox(page, font, meta.workplaceManagementNumber, META_BOXES.workplaceManagementNumber);
  drawInBox(page, font, meta.companyName, META_BOXES.companyName);
  drawInBox(page, font, meta.businessRegistrationNumber, META_BOXES.businessRegistrationNumber);
  // Row 2: 소재지
  drawInBox(page, font, meta.companyAddress, META_BOXES.companyAddress);
  // Row 3: 전화번호 | 대표자명
  drawInBox(page, font, formatPhone(meta.companyPhone), META_BOXES.companyPhone);
  drawInBox(page, font, meta.representativeName, META_BOXES.representativeName);
  // Row 4: 공사명
  drawInBox(page, font, meta.siteName, META_BOXES.siteName);
  // Top-right
  drawInBox(page, font, `${meta.workYear}`.slice(-2), META_BOXES.workYear);
  drawInBox(page, font, `${meta.workMonth}`, META_BOXES.workMonth);
  drawInBox(page, font, `${packetNumber}`, META_BOXES.packetNumber);
  drawInBox(page, font, `${packetCount}`, META_BOXES.packetCount);
}

function drawFooter(page: PDFPage, font: PDFFont, meta: LaborResolvedMeta) {
  const signedDate = parsePaymentDate(meta.paymentDate) ?? {
    year: String(meta.workYear),
    month: String(meta.workMonth),
    day: '',
  };

  drawInBox(page, font, signedDate.year, FOOTER_BOXES.signedYear);
  drawInBox(page, font, signedDate.month, FOOTER_BOXES.signedMonth);
  drawInBox(page, font, signedDate.day, FOOTER_BOXES.signedDay);
  drawInBox(page, font, meta.representativeName, FOOTER_BOXES.signerName);
}

// Split resident ID into front 6 + back 7, placed around the template's pre-printed "-"
// Template "-" positions relative to column left: ~46.3 (W1), ~47.2 (W2), ~46.6 (W3), ~52.3 (W4)
// Using average ~47 as reference; front right-aligned before "-", back left-aligned after "-"
const RESID_FRONT_BOX: Box = { x: 2, y: 583.1, width: 43, size: 6.5, minSize: 5.5, align: 'right' };
const RESID_BACK_BOX: Box = { x: 51, y: 583.1, width: 46, size: 6.5, minSize: 5.5, align: 'left' };

function drawWorkerIdentity(page: PDFPage, font: PDFFont, row: ReportRow, left: number) {
  // Name, phone, jobType — standard boxes
  const standardValues = [
    row.worker.name || '',
    '', // skip residentId slot (handled separately below)
    formatPhone(row.worker.phone || ''),
    row.worker.jobType || '',
  ];
  WORKER_IDENTITY_BOXES.forEach((box, index) => {
    if (index === 1) return; // skip residentId
    drawInBox(page, font, standardValues[index] ?? '', { ...box, x: left + box.x });
  });

  // Resident ID — split around template "-"
  const digits = (row.worker.residentId || '').replace(/\D/g, '').slice(0, 13);
  if (digits.length >= 6) {
    const front = digits.slice(0, 6);
    const back = digits.slice(6);
    drawInBox(page, font, front, { ...RESID_FRONT_BOX, x: left + RESID_FRONT_BOX.x });
    if (back) {
      drawInBox(page, font, back, { ...RESID_BACK_BOX, x: left + RESID_BACK_BOX.x });
    }
  }
}

function drawWorkerCalcFields(page: PDFPage, font: PDFFont, row: ReportRow, left: number) {
  const dayCount = row.workedDayCount ? `${row.workedDayCount}` : '';
  const hours = row.workedDayCount ? `${row.workedDayCount * 8}` : '';

  const fields: Array<{ key: keyof typeof WORKER_CALC_BOXES; value: string }> = [
    { key: 'dayCount', value: dayCount },
    { key: 'hours', value: hours },
    { key: 'baseDays', value: dayCount },
    { key: 'grossPay', value: row.ledger?.grossPay ? formatWon(row.ledger.grossPay) : '' },
    { key: 'totalWages', value: row.ledger?.grossPay ? formatWon(row.ledger.grossPay) : '' },
    { key: 'incomeTax', value: row.ledger?.incomeTax ? formatWon(row.ledger.incomeTax) : '' },
    { key: 'localIncomeTax', value: row.ledger?.localIncomeTax ? formatWon(row.ledger.localIncomeTax) : '' },
  ];

  fields.forEach(({ key, value }) => {
    const box = WORKER_CALC_BOXES[key];
    drawInBox(page, font, value, { ...box, x: left + box.x });
  });
}

function drawWorkedDays(page: PDFPage, font: PDFFont, workedDays: number[], left: number) {
  const workedDaySet = new Set(workedDays);
  const markSize = 7;

  for (let day = 1; day <= 31; day++) {
    const row = Math.floor((day - 1) / DAY_COLS);  // 0-6
    const col = (day - 1) % DAY_COLS;               // 0-4

    if (row >= DAY_MARK_TOP.length) continue;
    if (!workedDaySet.has(day)) continue;

    const cellLeft = left + DAY_COL_LEFT[col];
    const cellWidth = DAY_COL_WIDTH[col];
    const cellTop = DAY_MARK_TOP[row];
    const cellBottom = DAY_MARK_BOTTOM[row];

    // Center the ○ horizontally and vertically in the mark sub-cell
    const textWidth = font.widthOfTextAtSize(CIRCLE_MARK, markSize);
    const x = cellLeft + (cellWidth - textWidth) / 2;
    // PDF y is baseline; shift down from cell vertical center by ~1/3 of font size
    const y = (cellTop + cellBottom) / 2 - markSize * 0.35;

    page.drawText(CIRCLE_MARK, {
      x,
      y,
      size: markSize,
      color: rgb(0, 0, 0),
    });
  }
}

export async function generateLaborReportPdf({
  meta,
  reportRows,
}: {
  meta: LaborResolvedMeta;
  reportRows: ReportRow[];
}) {
  const [templateBytes, fontBytes] = await Promise.all([
    fetch(templatePdfUrl).then((response) => response.arrayBuffer()),
    fetch(malgunFontUrl).then((response) => response.arrayBuffer()),
  ]);

  const templateDoc = await PDFDocument.load(templateBytes);
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });

  const templatePageIndices = templateDoc.getPageIndices();
  const chunks = chunkRows(reportRows, 4);

  for (const [packetIndex, chunk] of chunks.entries()) {
    const copiedPages = await pdfDoc.copyPages(templateDoc, templatePageIndices);
    copiedPages.forEach((page) => pdfDoc.addPage(page));

    const packetPages = pdfDoc
      .getPages()
      .slice(packetIndex * templatePageIndices.length, (packetIndex + 1) * templatePageIndices.length);

    packetPages.forEach((page) => page.setFont(font));

    const firstPage = packetPages[0];
    if (!firstPage) continue;

    drawCommonMeta(firstPage, font, meta, packetIndex + 1, chunks.length);
    drawFooter(firstPage, font, meta);

    chunk.forEach((row, workerIndex) => {
      const left = WORKER_COLUMN_LEFT[workerIndex];
      if (typeof left !== 'number') return;
      drawWorkerIdentity(firstPage, font, row, left);
      drawWorkedDays(firstPage, font, row.workedDays, left);
      drawWorkerCalcFields(firstPage, font, row, left);
    });
  }

  return pdfDoc.save();
}
