import { Fragment, useRef, useState, useCallback, useEffect } from 'react';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [zoom, setZoom] = useState(100);

  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + 30, 200)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z - 30, 50)), []);
  const zoomReset = useCallback(() => setZoom(100), []);

  // 핀치줌 — zoomRef로 현재 zoom 추적, 리스너 재등록 방지
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let startDist = 0;
    let startZoom = 100;

    const getDistance = (touches: TouchList) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        startDist = getDistance(e.touches);
        startZoom = zoomRef.current;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = getDistance(e.touches);
        const scale = dist / startDist;
        const dampedScale = 1 + (scale - 1) * 0.4;
        const newZoom = Math.round(Math.min(200, Math.max(50, startZoom * dampedScale)));
        setZoom(newZoom);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  const validRecords = records.filter((r) => r.diameter > 0 && r.location.trim() !== '' && r.species !== '');

  if (validRecords.length === 0) {
    return (
      <p className="text-gray-400 dark:text-gray-500 py-12 text-center">
        집계할 데이터가 없습니다.
      </p>
    );
  }

  const result = aggregate(validRecords);
  const fileName = projectName ? `${projectName}_집계` : '수목_전정_현황';

  const captureTable = async (): Promise<HTMLCanvasElement> => {
    const el = tableRef.current!;
    const wasDark = document.documentElement.classList.contains('dark');
    if (wasDark) document.documentElement.classList.remove('dark');

    // 캡처 시 zoom을 100%로 리셋
    const prevZoom = zoom;
    el.style.transform = 'scale(1)';

    // 캡처 전: 모든 th/td에 인라인 border 강제 적용
    const cells = el.querySelectorAll('th, td');
    cells.forEach((cell) => {
      (cell as HTMLElement).style.border = '1px solid #d1d5db';
    });

    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    });

    // 캡처 후: 원래 상태 복원
    cells.forEach((cell) => {
      (cell as HTMLElement).style.border = '';
    });
    el.style.transform = `scale(${prevZoom / 100})`;

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
      const pdf = new jsPDF({
        orientation: 'landscape',
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
    setExporting(true);
    try {
      const canvas = await captureTable();
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png'),
      );
      const file = new File([blob], `${fileName}.png`, { type: 'image/png' });

      // 1순위: Web Share API (모바일 공유 시트)
      if (typeof navigator.share === 'function') {
        const shareData: ShareData = { files: [file], title: fileName };
        if (navigator.canShare?.(shareData)) {
          try {
            await navigator.share(shareData);
            return;
          } catch (e) {
            if (e instanceof Error && e.name === 'AbortError') return;
          }
        }
        // 파일 공유 불가 시 URL 없이 텍스트만 공유 시도
        try {
          await navigator.share({ title: fileName, text: '수목 전정 현황 집계표' });
          return;
        } catch {
          // 무시
        }
      }

      // 2순위: 클립보드 복사
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        alert('이미지가 클립보드에 복사되었습니다.\n원하는 앱에 붙여넣기 하세요.');
        return;
      } catch {
        // 무시
      }

      // 3순위: 다운로드
      const link = document.createElement('a');
      link.download = `${fileName}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      setExporting(false);
    }
  };

  // 인라인 스타일 — html2canvas 호환용
  const cellStyle: React.CSSProperties = {
    border: '1px solid #d1d5db',
    padding: '6px 8px',
    textAlign: 'center',
  };
  const thStyle: React.CSSProperties = {
    ...cellStyle,
    backgroundColor: '#f3f4f6',
    fontWeight: 600,
    color: '#374151',
  };
  const thSubStyle: React.CSSProperties = {
    ...cellStyle,
    backgroundColor: '#f9fafb',
    fontWeight: 600,
    color: '#374151',
    fontSize: '12px',
    whiteSpace: 'nowrap',
  };

  return (
    <div>
      {/* 툴바: 내보내기 + 줌 */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          onClick={downloadPng}
          disabled={exporting}
          className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium
            cursor-pointer active:bg-emerald-700 disabled:opacity-50"
        >
          PNG
        </button>
        <button
          onClick={downloadPdf}
          disabled={exporting}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium
            cursor-pointer active:bg-blue-700 disabled:opacity-50"
        >
          PDF
        </button>
        <button
          onClick={sharePng}
          disabled={exporting}
          className="px-3 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium
            cursor-pointer active:bg-violet-700 disabled:opacity-50"
        >
          공유
        </button>

        <div className="flex items-center gap-1 ml-auto
          bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <button
            onClick={zoomOut}
            className="w-8 h-8 flex items-center justify-center text-lg cursor-pointer
              text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700
              rounded-l-lg"
          >
            −
          </button>
          <button
            onClick={zoomReset}
            className="px-2 h-8 text-xs font-medium cursor-pointer
              text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700
              min-w-[3rem] text-center"
          >
            {zoom}%
          </button>
          <button
            onClick={zoomIn}
            className="w-8 h-8 flex items-center justify-center text-lg cursor-pointer
              text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700
              rounded-r-lg"
          >
            +
          </button>
        </div>
      </div>

      {/* 캡처 대상 영역 (핀치줌 감지) */}
      <div ref={containerRef} className="overflow-auto -mx-4 px-4 pb-4 touch-none">
        <div
          ref={tableRef}
          style={{
            display: 'inline-block',
            minWidth: '100%',
            backgroundColor: '#fff',
            padding: '12px',
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top left',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '12px' }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#111827' }}>
              수목 전정 현황
            </div>
            {projectName && (
              <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '2px' }}>{projectName}</div>
            )}
          </div>
          <table style={{ borderCollapse: 'collapse', fontSize: '13px', width: '100%' }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ ...thStyle, minWidth: '70px' }}>위치</th>
                {SPECIES_LIST.map((sp) => (
                  <th
                    key={sp}
                    colSpan={DIAMETER_RANGES.length + 1}
                    style={thStyle}
                  >
                    {sp}
                  </th>
                ))}
                <th rowSpan={2} style={thStyle}>합계</th>
              </tr>
              <tr>
                {SPECIES_LIST.map((sp) => (
                  <Fragment key={sp}>
                    {DIAMETER_RANGES.map((dr) => (
                      <th key={`${sp}-${dr}`} style={thSubStyle}>
                        {DIAMETER_LABELS[dr]}
                      </th>
                    ))}
                    <th key={`${sp}-sub`} style={{ ...thSubStyle, fontWeight: 700 }}>소계</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.location}>
                  <td style={{ ...cellStyle, fontWeight: 500, textAlign: 'left', color: '#1f2937' }}>
                    {row.location}
                  </td>
                  {SPECIES_LIST.map((sp) => (
                    <Fragment key={sp}>
                      {DIAMETER_RANGES.map((dr) => (
                        <td key={`${row.location}-${sp}-${dr}`} style={{ ...cellStyle, color: '#1f2937' }}>
                          {row.counts[sp][dr] || ''}
                        </td>
                      ))}
                      <td
                        key={`${row.location}-${sp}-sub`}
                        style={{ ...cellStyle, fontWeight: 700, backgroundColor: '#f9fafb', color: '#1f2937' }}
                      >
                        {row.speciesSubtotals[sp] || ''}
                      </td>
                    </Fragment>
                  ))}
                  <td style={{ ...cellStyle, fontWeight: 700, backgroundColor: '#eff6ff', color: '#1f2937' }}>
                    {row.total}
                  </td>
                </tr>
              ))}
              {/* 소계 행 */}
              <tr>
                <td style={{ ...cellStyle, fontWeight: 700, backgroundColor: '#fefce8', textAlign: 'left', color: '#1f2937' }}>
                  소계
                </td>
                {SPECIES_LIST.map((sp) => (
                  <Fragment key={sp}>
                    {DIAMETER_RANGES.map((dr) => (
                      <td key={`total-${sp}-${dr}`} style={{ ...cellStyle, fontWeight: 700, backgroundColor: '#fefce8', color: '#1f2937' }}>
                        {result.columnTotals[sp][dr] || ''}
                      </td>
                    ))}
                    <td
                      key={`total-${sp}-sub`}
                      style={{ ...cellStyle, fontWeight: 700, backgroundColor: '#fef9c3', color: '#1f2937' }}
                    >
                      {result.speciesTotals[sp]}
                    </td>
                  </Fragment>
                ))}
                <td style={{ ...cellStyle, fontWeight: 700, backgroundColor: '#dbeafe', color: '#1f2937' }}>
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
