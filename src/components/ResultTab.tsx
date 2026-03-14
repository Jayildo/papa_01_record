import { Fragment, useRef, useState } from 'react';
import type { TreeRecord } from '../types';
import { DIAMETER_RANGES, SPECIES_LIST, DIAMETER_LABELS } from '../types';
import { aggregate } from '../utils/aggregate';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

interface Props {
  records: TreeRecord[];
  projectName?: string;
}

export default function ResultTab({ records, projectName }: Props) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const validRecords = records.filter((r) => r.diameter > 0 && r.location.trim() !== '' && r.species !== '');

  if (validRecords.length === 0) {
    return (
      <p className="text-gray-400 dark:text-gray-500 py-12 text-center">
        집계할 데이터가 없습니다.
      </p>
    );
  }

  const result = aggregate(validRecords);
  const fileName = projectName ? `${projectName}_집계` : '수목_흉고직경_집계';

  const captureTable = async (): Promise<HTMLCanvasElement> => {
    const el = tableRef.current!;
    // 캡처 시 다크모드 해제하고 흰 배경으로
    const wasDark = document.documentElement.classList.contains('dark');
    if (wasDark) document.documentElement.classList.remove('dark');
    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    });
    if (wasDark) document.documentElement.classList.add('dark');
    return canvas;
  };

  const downloadPng = async () => {
    setExporting(true);
    try {
      const canvas = await captureTable();
      const link = document.createElement('a');
      link.download = `${fileName}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      setExporting(false);
    }
  };

  const downloadPdf = async () => {
    setExporting(true);
    try {
      const canvas = await captureTable();
      const imgData = canvas.toDataURL('image/png');
      const imgW = canvas.width;
      const imgH = canvas.height;
      // 가로 PDF, 여백 10mm
      const pdf = new jsPDF({
        orientation: imgW > imgH ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      const pageW = pdf.internal.pageSize.getWidth() - 20;
      const pageH = pdf.internal.pageSize.getHeight() - 20;
      const ratio = Math.min(pageW / imgW, pageH / imgH);
      const w = imgW * ratio;
      const h = imgH * ratio;
      pdf.addImage(imgData, 'PNG', 10, 10, w, h);
      pdf.save(`${fileName}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  const sharePng = async () => {
    if (!navigator.share || !navigator.canShare) {
      downloadPng();
      return;
    }
    setExporting(true);
    try {
      const canvas = await captureTable();
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png'),
      );
      const file = new File([blob], `${fileName}.png`, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
      } else {
        downloadPng();
      }
    } finally {
      setExporting(false);
    }
  };

  const thCls = 'border border-gray-300 dark:border-gray-600 px-2 py-2 text-gray-700 dark:text-gray-300';
  const tdCls = 'border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-center text-gray-800 dark:text-gray-200';

  return (
    <div>
      {/* 내보내기 버튼 */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <button
          onClick={downloadPng}
          disabled={exporting}
          className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium
            cursor-pointer active:bg-emerald-700 disabled:opacity-50"
        >
          PNG 저장
        </button>
        <button
          onClick={downloadPdf}
          disabled={exporting}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium
            cursor-pointer active:bg-blue-700 disabled:opacity-50"
        >
          PDF 저장
        </button>
        <button
          onClick={sharePng}
          disabled={exporting}
          className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium
            cursor-pointer active:bg-violet-700 disabled:opacity-50"
        >
          공유
        </button>
      </div>

      {/* 캡처 대상 영역 */}
      <div className="overflow-x-auto -mx-4 px-4 pb-4">
        <div ref={tableRef} className="inline-block min-w-full bg-white dark:bg-gray-900 p-2">
          <div className="text-center mb-3">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              수목 전정 현황
            </h2>
            {projectName && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{projectName}</p>
            )}
          </div>
          <table className="border-collapse text-sm min-w-full">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-800">
                <th rowSpan={2} className={`${thCls} min-w-20`}>위치</th>
                {SPECIES_LIST.map((sp) => (
                  <th
                    key={sp}
                    colSpan={DIAMETER_RANGES.length + 1}
                    className={`${thCls} text-center`}
                  >
                    {sp}
                  </th>
                ))}
                <th rowSpan={2} className={thCls}>합계</th>
              </tr>
              <tr className="bg-gray-50 dark:bg-gray-800/60">
                {SPECIES_LIST.map((sp) => (
                  <Fragment key={sp}>
                    {DIAMETER_RANGES.map((dr) => (
                      <th key={`${sp}-${dr}`} className={`${thCls} whitespace-nowrap text-center text-xs`}>
                        {DIAMETER_LABELS[dr]}
                      </th>
                    ))}
                    <th key={`${sp}-sub`} className={`${thCls} text-center font-bold`}>소계</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.location} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                  <td className={`${tdCls} font-medium text-left`}>{row.location}</td>
                  {SPECIES_LIST.map((sp) => (
                    <Fragment key={sp}>
                      {DIAMETER_RANGES.map((dr) => (
                        <td key={`${row.location}-${sp}-${dr}`} className={tdCls}>
                          {row.counts[sp][dr] || ''}
                        </td>
                      ))}
                      <td
                        key={`${row.location}-${sp}-sub`}
                        className={`${tdCls} font-bold bg-gray-50 dark:bg-gray-800/40`}
                      >
                        {row.speciesSubtotals[sp] || ''}
                      </td>
                    </Fragment>
                  ))}
                  <td className={`${tdCls} font-bold bg-blue-50 dark:bg-blue-900/20`}>
                    {row.total}
                  </td>
                </tr>
              ))}
              <tr className="bg-yellow-50 dark:bg-yellow-900/20 font-bold">
                <td className={`${tdCls} text-left`}>소계</td>
                {SPECIES_LIST.map((sp) => (
                  <Fragment key={sp}>
                    {DIAMETER_RANGES.map((dr) => (
                      <td key={`total-${sp}-${dr}`} className={tdCls}>
                        {result.columnTotals[sp][dr] || ''}
                      </td>
                    ))}
                    <td
                      key={`total-${sp}-sub`}
                      className={`${tdCls} bg-yellow-100 dark:bg-yellow-900/30`}
                    >
                      {result.speciesTotals[sp]}
                    </td>
                  </Fragment>
                ))}
                <td className={`${tdCls} bg-blue-100 dark:bg-blue-900/30`}>
                  {result.grandTotal}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
