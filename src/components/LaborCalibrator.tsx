import { useRef, useState, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import templatePdfUrl from '../assets/labor-report-template.pdf?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

type Marker = {
  id: string;
  label: string;
  x: number; // PDF x coordinate
  y: number; // PDF y coordinate
  color: string;
};

const INITIAL_MARKERS: Marker[] = [
  // Header — calibrated 2026-04-10
  { id: 'workplaceManagementNumber', label: '사업장관리번호', x: 158, y: 709.4, color: '#e74c3c' },
  { id: 'companyName', label: '명칭', x: 386, y: 709.4, color: '#e74c3c' },
  { id: 'businessRegistrationNumber', label: '사업자등록번호', x: 158.7, y: 698, color: '#e74c3c' },
  { id: 'companyAddress', label: '소재지', x: 124.7, y: 658.7, color: '#e74c3c' },
  { id: 'companyPhone', label: '전화번호', x: 266, y: 640.1, color: '#e74c3c' },
  { id: 'representativeName', label: '대표자', x: 193.3, y: 628.7, color: '#e74c3c' },
  { id: 'siteName', label: '공사명', x: 388, y: 676.7, color: '#e74c3c' },
  { id: 'workYear', label: '연도', x: 460.7, y: 758.1, color: '#e67e22' },
  { id: 'workMonth', label: '월', x: 494, y: 756.8, color: '#e67e22' },

  // Worker Identity (column 0, left=133)
  { id: 'W1_name', label: 'W1:성명', x: 142.7, y: 601.8, color: '#3498db' },
  { id: 'W1_residentId', label: 'W1:주민번호', x: 142.7, y: 583.1, color: '#3498db' },
  { id: 'W1_phone', label: 'W1:전화', x: 141.3, y: 547.8, color: '#3498db' },
  { id: 'W1_jobType', label: 'W1:직종', x: 142, y: 532.5, color: '#3498db' },

  // Day grid corners (column 0)
  { id: 'D_day1', label: 'D:1일', x: 142.8, y: 509.8, color: '#2ecc71' },
  { id: 'D_day5', label: 'D:5일', x: 220.5, y: 509.8, color: '#2ecc71' },
  { id: 'D_day31', label: 'D:31일', x: 142.8, y: 370.3, color: '#2ecc71' },

  // Calc fields (column 0, left=133)
  { id: 'W1_dayCount', label: 'W1:근로일수', x: 148, y: 353.4, color: '#9b59b6' },
  { id: 'W1_hours', label: 'W1:근로시간', x: 188, y: 350.8, color: '#9b59b6' },
  { id: 'W1_baseDays', label: 'W1:기초일수', x: 148, y: 333.4, color: '#9b59b6' },
  { id: 'W1_grossPay', label: 'W1:보수총액', x: 148.7, y: 318.7, color: '#9b59b6' },
  { id: 'W1_totalWages', label: 'W1:임금총액', x: 149.3, y: 304, color: '#9b59b6' },
  { id: 'W1_incomeTax', label: 'W1:소득세', x: 150, y: 188.7, color: '#e74c3c' },
  { id: 'W1_localTax', label: 'W1:지방세', x: 150, y: 165.4, color: '#e74c3c' },

  // Footer
  { id: 'signedYear', label: '서명:연', x: 418, y: 108.8, color: '#f39c12' },
  { id: 'signedMonth', label: '서명:월', x: 466, y: 108.8, color: '#f39c12' },
  { id: 'signedDay', label: '서명:일', x: 505.3, y: 108.8, color: '#f39c12' },
  { id: 'signerName', label: '서명자', x: 391.3, y: 97.5, color: '#f39c12' },
];

export default function LaborCalibrator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [markers, setMarkers] = useState<Marker[]>(INITIAL_MARKERS);
  const [scale, setScale] = useState(1.5);
  const [pageHeight, setPageHeight] = useState(841);
  const [dragging, setDragging] = useState<string | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Render PDF to canvas
  useEffect(() => {
    let cancelled = false;
    const renderPdf = async () => {
      try {
        const pdf = await pdfjsLib.getDocument(templatePdfUrl).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale });

        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        setPageHeight(page.getViewport({ scale: 1 }).height);

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        await page.render({ canvasContext: ctx, viewport, canvas } as never).promise;
      } catch (err) {
        console.error('PDF render error:', err);
      }
    };
    renderPdf();
    return () => { cancelled = true; };
  }, [scale]);

  // Convert PDF coords to screen coords
  const pdfToScreen = useCallback(
    (pdfX: number, pdfY: number) => ({
      screenX: pdfX * scale,
      screenY: (pageHeight - pdfY) * scale,
    }),
    [scale, pageHeight],
  );

  // Convert screen coords to PDF coords
  const screenToPdf = useCallback(
    (screenX: number, screenY: number) => ({
      pdfX: screenX / scale,
      pdfY: pageHeight - screenY / scale,
    }),
    [scale, pageHeight],
  );

  // Mouse drag handlers
  const handleMouseDown = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(id);
    setSelectedMarker(id);
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const screenX = e.clientX - rect.left + containerRef.current.scrollLeft;
      const screenY = e.clientY - rect.top + containerRef.current.scrollTop;
      const { pdfX, pdfY } = screenToPdf(screenX, screenY);
      setMarkers((prev) =>
        prev.map((m) =>
          m.id === dragging
            ? { ...m, x: Math.round(pdfX * 10) / 10, y: Math.round(pdfY * 10) / 10 }
            : m,
        ),
      );
    },
    [dragging, screenToPdf],
  );

  const handleMouseUp = useCallback(() => setDragging(null), []);

  // Touch drag handlers for mobile
  const touchStateRef = useRef<{ id: string; startTouchX: number; startTouchY: number; startPdfX: number; startPdfY: number } | null>(null);

  const handleTouchStart = (id: string, e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    const touch = e.touches[0];
    const marker = markers.find((m) => m.id === id);
    if (!marker) return;
    touchStateRef.current = {
      id,
      startTouchX: touch.clientX,
      startTouchY: touch.clientY,
      startPdfX: marker.x,
      startPdfY: marker.y,
    };
    setDragging(id);
    setSelectedMarker(id);
  };

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const ts = touchStateRef.current;
      if (!ts || e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0];
      const dx = (touch.clientX - ts.startTouchX) / scale;
      const dy = (touch.clientY - ts.startTouchY) / scale;
      setMarkers((prev) =>
        prev.map((m) =>
          m.id === ts.id
            ? {
                ...m,
                x: Math.round((ts.startPdfX + dx) * 10) / 10,
                // Y is flipped: moving finger down = lower screen Y = lower PDF Y
                y: Math.round((ts.startPdfY - dy) * 10) / 10,
              }
            : m,
        ),
      );
    },
    [scale],
  );

  const handleTouchEnd = useCallback(() => {
    touchStateRef.current = null;
    setDragging(null);
  }, []);

  // Delete marker
  const deleteMarker = (id: string) => {
    setMarkers((prev) => prev.filter((m) => m.id !== id));
    if (selectedMarker === id) setSelectedMarker(null);
  };

  // Export coordinates as JSON
  const exportCoords = async () => {
    const data = markers.reduce<Record<string, { x: number; y: number }>>((acc, m) => {
      acc[m.id] = { x: m.x, y: m.y };
      return acc;
    }, {});
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert(JSON.stringify(data, null, 2));
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-2 bg-gray-800 border-b border-gray-700 shrink-0">
        <span className="text-sm font-bold whitespace-nowrap">PDF 좌표 캘리브레이터</span>
        <div className="flex gap-1">
          {([1, 1.5, 2] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScale(s)}
              className={`px-2 py-1 text-xs rounded ${scale === s ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
            >
              {s * 100}%
            </button>
          ))}
        </div>
        <button
          onClick={exportCoords}
          className={`px-3 py-1 text-xs rounded transition-colors ${copied ? 'bg-emerald-600' : 'bg-green-700 hover:bg-green-600'}`}
        >
          {copied ? '복사됨!' : '좌표 복사 (JSON)'}
        </button>
        <span className="text-xs text-gray-400">
          드래그: 이동 | 우클릭: 삭제 | 마커 {markers.length}개
        </span>
      </div>

      {/* Canvas + markers container */}
      <div className="flex-1 overflow-auto">
        <div
          ref={containerRef}
          className="relative inline-block"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ cursor: dragging ? 'grabbing' : 'default' }}
        >
          <canvas ref={canvasRef} className="block" />

          {/* Markers */}
          {markers.map((marker) => {
            const { screenX, screenY } = pdfToScreen(marker.x, marker.y);
            const isSelected = selectedMarker === marker.id;
            const isDraggingThis = dragging === marker.id;
            return (
              <div
                key={marker.id}
                className="absolute select-none"
                style={{
                  left: screenX - 4,
                  top: screenY - 4,
                  cursor: isDraggingThis ? 'grabbing' : 'grab',
                  zIndex: isSelected ? 20 : 10,
                }}
                onMouseDown={(e) => handleMouseDown(marker.id, e)}
                onTouchStart={(e) => handleTouchStart(marker.id, e)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  deleteMarker(marker.id);
                }}
              >
                {/* Dot */}
                <div
                  className="w-2 h-2 rounded-full border border-white"
                  style={{ backgroundColor: marker.color }}
                />
                {/* Label */}
                <div
                  className="absolute left-3 top-[-6px] whitespace-nowrap text-[9px] px-1 rounded pointer-events-none flex items-center gap-1"
                  style={{ backgroundColor: marker.color + 'CC', color: '#fff' }}
                >
                  <span>{marker.label} ({marker.x.toFixed(1)}, {marker.y.toFixed(1)})</span>
                  <span
                    className="pointer-events-auto cursor-pointer font-bold leading-none hover:opacity-70"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); deleteMarker(marker.id); }}
                  >
                    ✕
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected marker detail panel */}
      {selectedMarker && (() => {
        const m = markers.find((mk) => mk.id === selectedMarker);
        if (!m) return null;
        return (
          <div className="p-2 bg-gray-800 border-t border-gray-700 flex items-center gap-4 text-xs shrink-0">
            <span className="font-bold" style={{ color: m.color }}>
              {m.label}
            </span>
            <span>x: {m.x.toFixed(1)}</span>
            <span>y: {m.y.toFixed(1)}</span>
            <button
              onClick={() => deleteMarker(m.id)}
              className="px-2 py-0.5 bg-red-700 hover:bg-red-600 rounded"
            >
              삭제
            </button>
          </div>
        );
      })()}
    </div>
  );
}
