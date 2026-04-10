/**
 * Automated PDF coordinate verification pipeline:
 * 1. Generate a test report PDF with sample data
 * 2. Extract all text positions from the generated PDF
 * 3. Extract all text positions from the template PDF
 * 4. Check for overlaps between overlay data and template labels
 * 5. Check that overlay data falls within correct cell boundaries
 */
import fs from 'fs';
import { PDFDocument, PDFName, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

// ── helpers ──
function extractTextItems(pdfBytes) {
  return extractTextItemsAsync(pdfBytes);
}

async function extractTextItemsAsync(pdfBytes) {
  const pdf = await PDFDocument.load(pdfBytes);
  const page = pdf.getPage(0);

  // find resources up the tree
  let resources = page.node.get(PDFName.of('Resources'));
  if (resources?.constructor.name === 'PDFRef') resources = pdf.context.lookup(resources);
  if (!resources) {
    const parent = pdf.context.lookup(page.node.get(PDFName.of('Parent')));
    resources = parent?.get(PDFName.of('Resources'));
    if (resources?.constructor.name === 'PDFRef') resources = pdf.context.lookup(resources);
  }
  let fonts = resources?.get(PDFName.of('Font'));
  if (fonts?.constructor.name === 'PDFRef') fonts = pdf.context.lookup(fonts);

  const cmapAll = {};
  if (fonts) {
    for (const [nameRef, fontRef] of fonts.entries()) {
      const fn = nameRef.toString();
      const fo = pdf.context.lookup(fontRef);
      const tuRef = fo.get(PDFName.of('ToUnicode'));
      if (!tuRef) continue;
      const tus = pdf.context.lookup(tuRef);
      const cmap = Buffer.from(decodePDFRawStream(tus).decode()).toString('utf8');
      const cm = {};
      let m;
      const bfc = /beginbfchar\s*([\s\S]*?)\s*endbfchar/g;
      while ((m = bfc.exec(cmap))) {
        (m[1].match(/<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>/g) || []).forEach(p => {
          const [, s, d] = p.match(/<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>/);
          cm[parseInt(s, 16)] = String.fromCodePoint(parseInt(d, 16));
        });
      }
      const bfr = /beginbfrange\s*([\s\S]*?)\s*endbfrange/g;
      while ((m = bfr.exec(cmap))) {
        (m[1].match(/<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>/g) || []).forEach(r => {
          const [, st, en, ds] = r.match(/<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>/);
          const s = parseInt(st,16), e = parseInt(en,16), d = parseInt(ds,16);
          for (let i = s; i <= e; i++) cm[i] = String.fromCodePoint(d+(i-s));
        });
      }
      cmapAll[fn] = cm;
    }
  }

  const contentsRef = page.node.get(PDFName.of('Contents'));
  let sRef = contentsRef;
  if (contentsRef?.constructor.name === 'PDFArray') sRef = contentsRef.get(0);
  if (!sRef) return [];
  const st = pdf.context.lookup(sRef);
  const content = Buffer.from(decodePDFRawStream(st).decode()).toString('utf8');

  const scale = 0.12, yOff = 841;
  const items = [];
  let curFont = null, px, py;
  for (const line of content.split('\n')) {
    const l = line.trim();
    const fm = l.match(/\/(\w+)\s+[\d.]+\s+Tf/);
    if (fm) curFont = '/' + fm[1];
    const tm = l.match(/1\.000\s+0\.000\s+0\.000\s+-1\.000\s+([\d.]+)\s+([\d.]+)\s+Tm/);
    if (tm) { px = parseFloat(tm[1])*scale; py = yOff - parseFloat(tm[2])*scale; }
    const tj = l.match(/\[(.+)\]TJ/);
    if (tj && px !== undefined) {
      const map = cmapAll[curFont] || {};
      let text = '';
      let hm; const hp = /<([0-9A-Fa-f]+)>/g;
      while ((hm = hp.exec(tj[1]))) text += map[parseInt(hm[1],16)] || '?';
      if (text) items.push({ x: px, y: py, text });
    }
    // Also catch simple Tj (not array)
    const tj2 = l.match(/\(([^)]*)\)\s*Tj/);
    if (tj2 && px !== undefined) {
      items.push({ x: px, y: py, text: tj2[1] });
    }
  }

  // Also handle ALL content streams (pdf-lib appends overlay as additional streams)
  const contentsArr = page.node.get(PDFName.of('Contents'));
  let allRefs = [];
  if (contentsArr?.constructor.name === 'PDFArray') {
    for (let i = 0; i < contentsArr.size(); i++) allRefs.push(contentsArr.get(i));
  } else if (contentsArr) {
    allRefs.push(contentsArr);
  }

  // Parse additional streams (beyond the first template stream) for overlay text
  // pdf-lib format: 1 0 0 1 X Y Tm (no Y-flip, direct PDF coords)
  for (let si = 2; si < allRefs.length; si++) {
    const extraStream = pdf.context.lookup(allRefs[si]);
    if (!extraStream) continue;
    let extraContent;
    try {
      extraContent = Buffer.from(decodePDFRawStream(extraStream).decode()).toString('utf8');
    } catch { continue; }

    // Find overlay font ToUnicode mappings
    // pdf-lib uses font names like /MalgunGothic-NNNN
    // We need to build CMap for these too
    // Actually, pdf-lib subset fonts have their own ToUnicode
    // For now, we can extract positions even without decoding text — position is what matters for overlap check

    let ovX, ovY;
    for (const line of extraContent.split('\n')) {
      const l = line.trim();
      // pdf-lib Tm: 1 0 0 1 X Y Tm
      const tmMatch = l.match(/^1\s+0\s+0\s+1\s+([\d.]+)\s+([\d.]+)\s+Tm$/);
      if (tmMatch) {
        ovX = parseFloat(tmMatch[1]);
        ovY = parseFloat(tmMatch[2]);
      }
      // Hex Tj — overlay text
      const tjMatch = l.match(/^<([0-9A-Fa-f]+)>\s*Tj$/);
      if (tjMatch && ovX !== undefined) {
        // Hex is glyph IDs (2 bytes each). We can't decode without the subset font's ToUnicode,
        // but we know each 4 hex chars = 1 glyph. Count = text length
        const glyphCount = tjMatch[1].length / 4;
        items.push({ x: ovX, y: ovY, text: `[overlay ${glyphCount}ch]`, overlay: true, glyphs: glyphCount });
      }
    }
  }

  return items;
}

// Extract grid lines from template
async function extractGridLines(pdfBytes) {
  const pdf = await PDFDocument.load(pdfBytes);
  const page = pdf.getPage(0);
  const contentsRef = page.node.get(PDFName.of('Contents'));
  let sRef = contentsRef;
  if (contentsRef?.constructor.name === 'PDFArray') sRef = contentsRef.get(0);
  const st = pdf.context.lookup(sRef);
  const content = Buffer.from(decodePDFRawStream(st).decode()).toString('utf8');

  const lp = /([\d.]+)\s+([\d.]+)\s+m\s+([\d.]+)\s+([\d.]+)\s+l\s*(?:\n\s*)?S/g;
  const hLines = [], vLines = [];
  let lm;
  while ((lm = lp.exec(content))) {
    const x1=parseFloat(lm[1]),y1=parseFloat(lm[2]),x2=parseFloat(lm[3]),y2=parseFloat(lm[4]);
    if (Math.abs(y1-y2)<1 && Math.abs(x2-x1)>30) hLines.push(Math.round(((y1+y2)/2)*2)/2);
    else if (Math.abs(x1-x2)<1 && Math.abs(y2-y1)>10)
      vLines.push({x:Math.round(((x1+x2)/2)*2)/2, y1:Math.min(y1,y2), y2:Math.max(y1,y2)});
  }
  return {
    hLines: [...new Set(hLines)].sort((a,b)=>b-a),
    vLines,
  };
}

// ── Main ──
async function main() {
  const templateBytes = fs.readFileSync('src/assets/labor-report-template.pdf');
  const fontBytes = fs.readFileSync('src/assets/malgun.ttf');

  // 1. Extract template structure
  console.log('1. Extracting template structure...');
  const templateItems = await extractTextItemsAsync(templateBytes);
  const { hLines, vLines } = await extractGridLines(templateBytes);
  console.log(`   ${templateItems.length} text items, ${hLines.length} h-lines, ${vLines.length} v-lines`);

  // 2. Generate test PDF using pdf-lib directly (no Vite imports)
  console.log('2. Generating test PDF with sample data...');
  const { rgb } = await import('pdf-lib');

  const templateDoc = await PDFDocument.load(templateBytes);
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });

  const copiedPages = await pdfDoc.copyPages(templateDoc, templateDoc.getPageIndices());
  copiedPages.forEach(p => pdfDoc.addPage(p));
  const pg = pdfDoc.getPage(0);
  pg.setFont(font);

  function draw(text, x, y, size = 6.5) {
    if (!text) return;
    pg.drawText(String(text), { x, y, size, font, color: rgb(0,0,0) });
  }

  // Header
  draw('12345-6789012', 158, 709.4);       // workplaceManagementNumber
  draw('주식회사 테스트조경', 386, 709.4);   // companyName
  draw('123-45-67890', 158.7, 698);         // businessRegistrationNumber
  draw('서울시 강남구 테헤란로 123', 124.7, 658.7); // companyAddress
  draw('02-1234-5678', 162, 640.7);         // companyPhone
  draw('홍길동', 193.3, 628.7);             // representativeName
  draw('테스트아파트 전정', 388, 676.7);     // siteName
  draw('26', 448, 751.8, 10.5);              // workYear right-aligned, ends before 년(464)
  draw('3', 488, 751.8, 10.5);              // workMonth right-aligned, ends before 월분(498.5)
  draw('1', 528, 751.8);                     // packetNumber
  draw('1', 546, 751.8);                    // packetCount

  // Worker 1 identity (column left=133)
  draw('김테스트', 133 + 9.7, 601.8);        // name
  // residentId — split around template "-": front 6 right-aligned, back 7 left-aligned
  draw('900101', 133 + 2, 583.1);            // front 6 digits (right-aligned before "-")
  draw('1234567', 133 + 51, 583.1);          // back 7 digits (left-aligned after "-")
  draw('010-1234-5678', 133 + 8.3, 547.8);   // phone
  draw('조경', 133 + 9, 532.5);              // jobType

  // Day grid O marks — use cell LEFT edge + center calculation
  const dayColLeft = [0, 19.5, 38.5, 58, 77];
  const dayColWidth = [19.5, 19.0, 19.5, 19.0, 21.0];
  const dayMarkTop = [515.5, 492.5, 469.0, 446.0, 422.5, 399.5, 376.0];
  const dayMarkBottom = [504.0, 481.0, 457.5, 434.0, 411.0, 387.5, 364.5];
  const workedDays = [1,2,3,5,8,9,10,15,20,25];
  const markChar = '\u25CB';
  const markSize = 7;
  const markWidth = font.widthOfTextAtSize(markChar, markSize);
  for (const day of workedDays) {
    const row = Math.floor((day-1)/5);
    const col = (day-1) % 5;
    if (row < dayMarkTop.length) {
      const cx = 133 + dayColLeft[col] + (dayColWidth[col] - markWidth) / 2;
      const cy = (dayMarkTop[row] + dayMarkBottom[row]) / 2 - markSize * 0.35;
      pg.drawText(markChar, { x: cx, y: cy, size: markSize, font, color: rgb(0,0,0) });
    }
  }

  // Calc fields — y aligned to unit label baselines
  draw('10', 133 + 15, 349.4);               // dayCount (same y as "일")
  draw('80', 133 + 61, 349.4);               // hours (same y as "시간")
  draw('10', 133 + 15, 330.9);               // baseDays (same y as "일")
  draw('2,000,000', 133 + 15, 316.1);        // grossPay (same y as "원")
  draw('2,000,000', 133 + 15, 301.5);        // totalWages (same y as "원")
  draw('49,950', 133 + 15, 186.4);           // incomeTax (same y as "원")
  draw('4,995', 133 + 15, 159.3);            // localIncomeTax (same y as "원")

  // Footer — right-aligned before 년/월/일 labels, same baseline y=107.8
  draw('2026', 410, 107.8, 8);               // signedYear (right-aligned before 년 at x=434.6)
  draw('4', 455, 107.8, 8);                  // signedMonth (before 월 at x=475.1)
  draw('10', 497, 107.8, 8);                 // signedDay (before 일 at x=515.4)
  draw('주식회사 테스트조경 홍길동', 310, 94.8, 7.2); // signerName centered between label(240) and sig(468)

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync('test-output.pdf', pdfBytes);
  console.log('   Written test-output.pdf');

  // 3. Extract text from generated PDF
  console.log('3. Extracting text from generated PDF...');
  const outputItems = await extractTextItemsAsync(pdfBytes);
  const overlayItems = outputItems.filter(i => {
    // Items NOT in template = overlay data
    return !templateItems.some(t =>
      Math.abs(t.x - i.x) < 1 && Math.abs(t.y - i.y) < 1 && t.text === i.text
    );
  });
  console.log(`   ${outputItems.length} total items, ${overlayItems.length} overlay items`);

  // 4. Check overlaps
  console.log('\n4. OVERLAP CHECK:');
  let overlapCount = 0;
  for (const ov of overlayItems) {
    // Check if any template text is within ~8pt of this overlay text
    const nearby = templateItems.filter(t =>
      Math.abs(t.x - ov.x) < 15 && Math.abs(t.y - ov.y) < 6 &&
      t.text.trim() !== '' && t.text !== ' ' && t.text !== '  '
    );
    if (nearby.length > 0) {
      overlapCount++;
      console.log(`   ⚠ OVERLAP: "${ov.text}" at (${ov.x.toFixed(1)}, ${ov.y.toFixed(1)}) near template text:`);
      nearby.forEach(n => console.log(`     "${n.text}" at (${n.x.toFixed(1)}, ${n.y.toFixed(1)})`));
    }
  }
  if (overlapCount === 0) console.log('   ✓ No overlaps detected');

  // 5. Check cell boundaries
  console.log('\n5. BOUNDARY CHECK:');
  function findRow(y) {
    let top = 841, bottom = 0;
    for (const hy of hLines) {
      if (hy > y && hy < top) top = hy;
      if (hy < y && hy > bottom) bottom = hy;
    }
    return { top, bottom };
  }

  for (const ov of overlayItems) {
    if (!ov.text.trim()) continue;
    const row = findRow(ov.y);
    const margin = 2;
    if (ov.y > row.top - margin || ov.y < row.bottom + margin) {
      console.log(`   ⚠ OUT OF ROW: "${ov.text}" at y=${ov.y.toFixed(1)} outside row ${row.bottom.toFixed(1)}-${row.top.toFixed(1)}`);
    }
  }

  // Summary
  console.log('\n=== OVERLAY DATA POSITIONS ===');
  overlayItems.filter(i => i.text.trim()).forEach(i => {
    console.log(`  "${i.text}" at (${i.x.toFixed(1)}, ${i.y.toFixed(1)})`);
  });
}

main().catch(e => console.error(e));
