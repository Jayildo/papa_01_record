import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import malgunFontUrl from '../assets/malgun.ttf?url';
import templatePdfUrl from '../assets/labor-report-template.pdf?url';

// Draw ruler ticks along edges of the page
function drawRulers(page: PDFPage, font: PDFFont) {
  const { width, height } = page.getSize();
  const tickSize = 5;
  const color = rgb(0.5, 0.5, 0.5); // gray
  const labelColor = rgb(0.3, 0.3, 0.3);

  // Bottom edge (X ruler)
  for (let x = 0; x <= width; x += 10) {
    const isMajor = x % 50 === 0;
    const len = isMajor ? tickSize * 2 : tickSize;
    page.drawLine({ start: { x, y: 0 }, end: { x, y: len }, color, thickness: 0.3 });
    if (isMajor) {
      page.drawText(`${x}`, { x: x + 1, y: len + 1, size: 4, font, color: labelColor });
    }
  }

  // Left edge (Y ruler)
  for (let y = 0; y <= height; y += 10) {
    const isMajor = y % 50 === 0;
    const len = isMajor ? tickSize * 2 : tickSize;
    page.drawLine({ start: { x: 0, y }, end: { x: len, y }, color, thickness: 0.3 });
    if (isMajor) {
      page.drawText(`${y}`, { x: len + 1, y: y + 1, size: 4, font, color: labelColor });
    }
  }

  // Right edge (Y ruler)
  for (let y = 0; y <= height; y += 10) {
    const isMajor = y % 50 === 0;
    const len = isMajor ? tickSize * 2 : tickSize;
    page.drawLine({ start: { x: width, y }, end: { x: width - len, y }, color, thickness: 0.3 });
    if (isMajor) {
      page.drawText(`${y}`, { x: width - len - 14, y: y + 1, size: 4, font, color: labelColor });
    }
  }

  // Top edge (X ruler)
  for (let x = 0; x <= width; x += 10) {
    const isMajor = x % 50 === 0;
    const len = isMajor ? tickSize * 2 : tickSize;
    page.drawLine({ start: { x, y: height }, end: { x, y: height - len }, color, thickness: 0.3 });
  }
}

// Draw a labeled crosshair marker
function drawMarker(page: PDFPage, font: PDFFont, x: number, y: number, label: string) {
  const color = rgb(1, 0, 0); // red
  const size = 8;

  // Crosshair
  page.drawLine({ start: { x: x - size, y }, end: { x: x + size, y }, color, thickness: 0.5 });
  page.drawLine({ start: { x, y: y - size }, end: { x, y: y + size }, color, thickness: 0.5 });

  // Small circle at center
  page.drawCircle({ x, y, size: 1.5, color, borderWidth: 0.3 });

  // Label (offset to top-right so it doesn't overlap the crosshair)
  page.drawText(label, {
    x: x + 3,
    y: y + 3,
    size: 4.5,
    font,
    color: rgb(0.8, 0, 0),
  });
}

export async function generateDebugPdf(): Promise<Uint8Array> {
  const [templateBytes, fontBytes] = await Promise.all([
    fetch(templatePdfUrl).then((r) => r.arrayBuffer()),
    fetch(malgunFontUrl).then((r) => r.arrayBuffer()),
  ]);

  const templateDoc = await PDFDocument.load(templateBytes);
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });

  // Copy first page only (the main form page)
  const [copiedPage] = await pdfDoc.copyPages(templateDoc, [0]);
  pdfDoc.addPage(copiedPage);
  const page = pdfDoc.getPage(0);

  // Draw rulers
  drawRulers(page, font);

  // Draw markers for worker column boundaries
  // W1: x=133→231, W2: x=231→331, W3: x=331→429.5, W4: x=429.5→540
  const WORKER_COLUMN_LEFT = [133, 231, 331, 429.5];
  WORKER_COLUMN_LEFT.forEach((left, i) => {
    // Draw a vertical dashed line at each column boundary
    for (let y = 350; y < 640; y += 4) {
      page.drawLine({
        start: { x: left, y },
        end: { x: left, y: y + 2 },
        color: rgb(0, 0, 1), // blue
        thickness: 0.3,
      });
    }
    drawMarker(page, font, left, 620, `col${i}`);
  });

  // Draw markers for key reference points that need calibration
  // Header area
  const headerMarkers: Array<[number, number, string]> = [
    [108, 726, 'H1:mgmtNo'],
    [193, 726, 'H1:company'],
    [275, 726, 'H1:bizNo'],
    [108, 712, 'H2:addr'],
    [108, 690, 'H3:phone'],
    [340, 690, 'H3:rep'],
    [108, 676, 'H4:site'],
    [472, 761, 'year'],
    [496, 761, 'month'],
    [528, 761, 'pktNo'],
    [546, 761, 'pktCnt'],
  ];

  headerMarkers.forEach(([x, y, label]) => drawMarker(page, font, x, y, label));

  // Worker identity area markers (for column 0 only, as reference)
  // x=0 offset (relative), actual x = WORKER_COLUMN_LEFT[0] + 0 = 133
  const col0Left = 133;
  const identityMarkers: Array<[number, number, string]> = [
    [col0Left, 583, 'W:name'],
    [col0Left, 564, 'W:resId'],
    [col0Left, 549, 'W:phone'],
    [col0Left, 535, 'W:job'],
  ];
  identityMarkers.forEach(([x, y, label]) => drawMarker(page, font, x, y, label));

  // Day grid area markers (5 cols × 7 rows)
  // Day col offsets relative to col left: [9.8, 29.0, 48.3, 67.5, 87.5]
  // Mark Y positions: [509.8, 486.8, 463.3, 440.0, 416.8, 393.5, 370.3]
  const DAY_COL_OFFSETS = [9.8, 29.0, 48.3, 67.5, 87.5];
  const DAY_MARK_Y = [509.8, 486.8, 463.3, 440.0, 416.8, 393.5, 370.3];
  const dayGridMarkers: Array<[number, number, string]> = [
    [col0Left + DAY_COL_OFFSETS[0], DAY_MARK_Y[0], 'D:day1'],
    [col0Left + DAY_COL_OFFSETS[4], DAY_MARK_Y[0], 'D:day5'],
    [col0Left + DAY_COL_OFFSETS[0], DAY_MARK_Y[1], 'D:day6'],
    [col0Left + DAY_COL_OFFSETS[0], DAY_MARK_Y[6], 'D:day31'],
  ];
  dayGridMarkers.forEach(([x, y, label]) => drawMarker(page, font, x, y, label));

  // Calc fields area markers (below day grid, for column 0)
  // x offsets relative to col left: dayCount=10, hours=55, baseDays=10, grossPay=10, etc.
  const calcMarkers: Array<[number, number, string]> = [
    [col0Left + 10, 354, 'C:days'],
    [col0Left + 55, 354, 'C:hours'],
    [col0Left + 10, 335, 'C:baseDays'],
    [col0Left + 10, 320, 'C:gross'],
    [col0Left + 10, 307, 'C:wages'],
    [col0Left + 10, 204, 'C:incTax'],
    [col0Left + 10, 186, 'C:locTax'],
  ];
  calcMarkers.forEach(([x, y, label]) => drawMarker(page, font, x, y, label));

  // Footer markers
  const footerMarkers: Array<[number, number, string]> = [
    [425, 107, 'F:year'],
    [468, 107, 'F:month'],
    [508, 107, 'F:day'],
    [400, 82, 'F:signer'],
  ];
  footerMarkers.forEach(([x, y, label]) => drawMarker(page, font, x, y, label));

  return pdfDoc.save();
}
