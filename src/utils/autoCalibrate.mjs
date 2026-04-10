import fs from 'fs';
import { PDFDocument, PDFName, decodePDFRawStream } from 'pdf-lib';

async function autoCalibrate() {
  const bytes = fs.readFileSync('src/assets/labor-report-template.pdf');
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(0);

  const contentsRef = page.node.get(PDFName.of('Contents'));
  let streamRef = contentsRef;
  if (contentsRef.constructor.name === 'PDFArray') streamRef = contentsRef.get(0);
  const stream = pdf.context.lookup(streamRef);
  const decoded = decodePDFRawStream(stream);
  const content = Buffer.from(decoded.decode()).toString('utf8');

  // Font ToUnicode
  let resources = page.node.get(PDFName.of('Resources'));
  if (resources && resources.constructor.name === 'PDFRef') resources = pdf.context.lookup(resources);
  if (!resources) {
    const parent = pdf.context.lookup(page.node.get(PDFName.of('Parent')));
    resources = parent.get(PDFName.of('Resources'));
    if (resources && resources.constructor.name === 'PDFRef') resources = pdf.context.lookup(resources);
  }
  let fonts = resources.get(PDFName.of('Font'));
  if (fonts && fonts.constructor.name === 'PDFRef') fonts = pdf.context.lookup(fonts);

  const charMappingsAll = {};
  for (const [nameRef, fontRef] of fonts.entries()) {
    const fontName = nameRef.toString();
    const fontObj = pdf.context.lookup(fontRef);
    const toUnicodeRef = fontObj.get(PDFName.of('ToUnicode'));
    if (!toUnicodeRef) continue;
    const toUnicodeStream = pdf.context.lookup(toUnicodeRef);
    const cmapData = Buffer.from(decodePDFRawStream(toUnicodeStream).decode()).toString('utf8');
    const cm = {};
    let m;
    const bfc = /beginbfchar\s*([\s\S]*?)\s*endbfchar/g;
    while ((m = bfc.exec(cmapData)) !== null) {
      (m[1].match(/<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>/g) || []).forEach(pair => {
        const [, s, d] = pair.match(/<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>/);
        cm[parseInt(s, 16)] = String.fromCodePoint(parseInt(d, 16));
      });
    }
    const bfr = /beginbfrange\s*([\s\S]*?)\s*endbfrange/g;
    while ((m = bfr.exec(cmapData)) !== null) {
      (m[1].match(/<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>/g) || []).forEach(r => {
        const [, start, end, dst] = r.match(/<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>/);
        const s = parseInt(start, 16), e = parseInt(end, 16), d = parseInt(dst, 16);
        for (let i = s; i <= e; i++) cm[i] = String.fromCodePoint(d + (i - s));
      });
    }
    charMappingsAll[fontName] = cm;
  }

  // Extract text
  const scale = 0.12, yOff = 841;
  const textItems = [];
  let curFont = null, posX, posY;
  for (const line of content.split('\n')) {
    const l = line.trim();
    const fm = l.match(/\/(\w+)\s+[\d.]+\s+Tf/);
    if (fm) curFont = '/' + fm[1];
    const tm = l.match(/1\.000\s+0\.000\s+0\.000\s+-1\.000\s+([\d.]+)\s+([\d.]+)\s+Tm/);
    if (tm) { posX = parseFloat(tm[1]) * scale; posY = yOff - parseFloat(tm[2]) * scale; }
    const tj = l.match(/\[(.+)\]TJ/);
    if (tj && posX !== undefined) {
      const map = charMappingsAll[curFont] || {};
      let text = '';
      let hm;
      const hp = /<([0-9A-Fa-f]+)>/g;
      while ((hm = hp.exec(tj[1])) !== null) text += map[parseInt(hm[1], 16)] || '?';
      if (text) textItems.push({ x: posX, y: posY, text });
    }
  }

  // Extract grid lines
  const lp = /([\d.]+)\s+([\d.]+)\s+m\s+([\d.]+)\s+([\d.]+)\s+l\s*(?:\n\s*)?S/g;
  const hLines = [], vLines = [];
  let lm;
  while ((lm = lp.exec(content)) !== null) {
    const x1 = parseFloat(lm[1]), y1 = parseFloat(lm[2]), x2 = parseFloat(lm[3]), y2 = parseFloat(lm[4]);
    if (Math.abs(y1 - y2) < 1 && Math.abs(x2 - x1) > 30) hLines.push((y1 + y2) / 2);
    else if (Math.abs(x1 - x2) < 1 && Math.abs(y2 - y1) > 10) vLines.push({ x: (x1 + x2) / 2, y1: Math.min(y1, y2), y2: Math.max(y1, y2) });
  }
  const uniqueH = [...new Set(hLines.map(y => Math.round(y * 2) / 2))].sort((a, b) => b - a);

  // Helpers
  function findRowBounds(y) {
    let top = 841, bottom = 0;
    for (const hy of uniqueH) {
      if (hy > y && hy < top) top = hy;
      if (hy < y && hy > bottom) bottom = hy;
    }
    return { top, bottom, cy: (top + bottom) / 2 };
  }

  // Worker columns
  const WCOL = [
    { left: 133, right: 231 },
    { left: 231, right: 331 },
    { left: 331, right: 429.5 },
    { left: 429.5, right: 540 },
  ];

  console.log('=== WORKER IDENTITY FIELDS ===');
  const identityFields = [
    { label: '성명', searchText: ['성명'], altY: null },
    { label: '주민등록번호', searchText: ['주민등록번호', '외국인등록번호'], altY: null },
    { label: '전화번호', searchText: ['전화번호'], altY: null },
    { label: '직종', searchText: ['직종'], altY: null },
  ];

  // Find identity rows by looking for label text near left column
  for (const field of identityFields) {
    // Find all text items containing the search terms
    const found = textItems.filter(t =>
      field.searchText.some(s => t.text.includes(s)) && t.x < 133
    );
    if (found.length === 0) {
      console.log(field.label + ': NOT FOUND');
      continue;
    }
    const labelY = found[0].y;
    const row = findRowBounds(labelY);

    // For each worker column, compute center of data cell
    const w1cx = (WCOL[0].left + WCOL[0].right) / 2;
    console.log(`${field.label}: label_y=${labelY.toFixed(1)} row=${row.bottom.toFixed(1)}-${row.top.toFixed(1)} data_cy=${row.cy.toFixed(1)} W1_cx=${w1cx.toFixed(1)}`);
    console.log(`  → relative x=${(w1cx - WCOL[0].left).toFixed(1)}, y=${row.cy.toFixed(1)}`);
  }

  console.log('\n=== CALC FIELDS (below day grid) ===');
  // Find calc field labels and their data cell positions, accounting for unit suffixes
  const calcFields = [
    { label: '근로일수', searchText: '근로일수' },
    { label: '근로시간', searchText: '근로시간' },
    { label: '보수지급기초일수', searchText: '보수지급기초일수' },
    { label: '보수총액', searchText: '보수총액' },
    { label: '임금총액', searchText: '임금총액' },
    { label: '비과세소득', searchText: '비과세소득' },
    { label: '소득세', searchText: '소득세', yRange: [183, 192] },
    { label: '지방소득세', searchText: '지방', yRange: [160, 170] },
  ];

  for (const field of calcFields) {
    let labelItem;
    if (field.yRange) {
      labelItem = textItems.find(t =>
        t.text.includes(field.searchText) && t.y >= field.yRange[0] && t.y <= field.yRange[1]
      );
    } else {
      labelItem = textItems.find(t => t.text.includes(field.searchText) && t.x < 133);
    }
    if (!labelItem) {
      console.log(field.label + ': NOT FOUND');
      continue;
    }

    const row = findRowBounds(labelItem.y);

    // Find unit suffix in W1 column at this y
    const unitItems = textItems.filter(t =>
      Math.abs(t.y - labelItem.y) < 3 &&
      (t.text === '원' || t.text === '일' || t.text === '시간' || t.text === '월') &&
      t.x > WCOL[0].left && t.x < WCOL[0].right
    );
    const w1Unit = unitItems[0];

    // Data area: from column left+2 to (unit position - 2) or (column right - 4)
    const dataLeft = WCOL[0].left + 2;
    const dataRight = w1Unit ? w1Unit.x - 2 : WCOL[0].right - 4;
    const dataCX = (dataLeft + dataRight) / 2;

    // For 근로일수/근로시간 which share a row with a divider at x≈180
    const dividers = vLines.filter(v =>
      v.x > WCOL[0].left && v.x < WCOL[0].right &&
      v.y1 <= labelItem.y && v.y2 >= labelItem.y
    );

    let note = '';
    if (dividers.length > 0 && field.label === '근로시간') {
      const div = dividers[0];
      const hoursLeft = div.x + 2;
      const hoursRight = w1Unit ? w1Unit.x - 2 : WCOL[0].right - 4;
      note = ` (after divider at x=${div.x.toFixed(1)}, data=${hoursLeft.toFixed(1)}-${hoursRight.toFixed(1)})`;
    }

    console.log(`${field.label}: label_y=${labelItem.y.toFixed(1)} row=${row.bottom.toFixed(1)}-${row.top.toFixed(1)} cy=${row.cy.toFixed(1)}`);
    console.log(`  data_x: ${dataLeft.toFixed(1)}-${dataRight.toFixed(1)} cx=${dataCX.toFixed(1)}${w1Unit ? ` unit="${w1Unit.text}" at x=${w1Unit.x.toFixed(1)}` : ''}${note}`);
    console.log(`  → relative x=${(dataLeft - WCOL[0].left).toFixed(1)}, y=${row.cy.toFixed(1)}, width=${(dataRight - dataLeft).toFixed(1)}`);
  }

  console.log('\n=== FOOTER ===');
  // Find date row
  const yearLabel = textItems.find(t => t.text.includes('년') && t.y > 105 && t.y < 115 && t.x > 430);
  const monthLabel = textItems.find(t => t.text.includes('월') && t.y > 105 && t.y < 115 && t.x > 470);
  const dayLabel = textItems.find(t => t.text === '일' && t.y > 105 && t.y < 115 && t.x > 510);

  if (yearLabel) console.log(`년 label: x=${yearLabel.x.toFixed(1)} y=${yearLabel.y.toFixed(1)} → data goes LEFT of this`);
  if (monthLabel) console.log(`월 label: x=${monthLabel.x.toFixed(1)} y=${monthLabel.y.toFixed(1)} → data goes LEFT of this`);
  if (dayLabel) console.log(`일 label: x=${dayLabel.x.toFixed(1)} y=${dayLabel.y.toFixed(1)} → data goes LEFT of this`);

  // Signer row
  const signerLabels = textItems.filter(t => t.y > 90 && t.y < 100 && t.x > 120 && t.x < 250);
  if (signerLabels.length) {
    const row = findRowBounds(signerLabels[0].y);
    console.log(`서명 row: y=${signerLabels[0].y.toFixed(1)} row=${row.bottom.toFixed(1)}-${row.top.toFixed(1)} cy=${row.cy.toFixed(1)}`);
    // Data goes after the label text, before (서명 또는 인)
    const sigParen = textItems.find(t => t.text.includes('서명') && t.y > 90 && t.y < 100 && t.x > 460);
    if (sigParen) console.log(`  (서명 또는 인) at x=${sigParen.x.toFixed(1)} → company name goes LEFT of this`);
  }
}

autoCalibrate().catch(e => console.error(e));
