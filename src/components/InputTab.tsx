import { useMemo, useRef, useEffect, useState } from 'react';
import type { TreeRecord } from '../types';
import LocationComboBox from './LocationComboBox';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

function diameterColor(d: number): string {
  if (!d || d <= 0) return '';
  if (d <= 10) return 'bg-emerald-100 border-emerald-300 dark:bg-emerald-900/40 dark:border-emerald-700';
  if (d <= 20) return 'bg-sky-100 border-sky-300 dark:bg-sky-900/40 dark:border-sky-700';
  if (d <= 30) return 'bg-amber-100 border-amber-300 dark:bg-amber-900/40 dark:border-amber-700';
  if (d <= 40) return 'bg-orange-100 border-orange-300 dark:bg-orange-900/40 dark:border-orange-700';
  if (d <= 50) return 'bg-rose-100 border-rose-300 dark:bg-rose-900/40 dark:border-rose-700';
  if (d <= 60) return 'bg-purple-100 border-purple-300 dark:bg-purple-900/40 dark:border-purple-700';
  if (d <= 70) return 'bg-indigo-100 border-indigo-300 dark:bg-indigo-900/40 dark:border-indigo-700';
  return 'bg-red-200 border-red-400 dark:bg-red-900/40 dark:border-red-700';
}

const SPECIES_OPTIONS: Array<'낙엽수' | '상록수'> = ['낙엽수', '상록수'];
const SPECIES_SHORT: Record<string, string> = { '낙엽수': '낙엽', '상록수': '상록' };

function SpeciesToggle({
  value,
  onChange,
}: {
  value: TreeRecord['species'];
  onChange: (v: '낙엽수' | '상록수') => void;
}) {
  const hasError = value === '';
  return (
    <div className={`inline-flex rounded-lg overflow-hidden border ${
      hasError
        ? 'border-red-400 ring-1 ring-red-300 dark:border-red-500 dark:ring-red-500/30'
        : 'border-gray-300 dark:border-gray-600'
    }`}>
      {SPECIES_OPTIONS.map((sp) => (
        <button
          key={sp}
          type="button"
          onClick={() => onChange(sp)}
          className={`px-3 py-1.5 text-sm cursor-pointer transition-colors font-medium ${
            value === sp
              ? sp === '낙엽수'
                ? 'bg-green-600 text-white dark:bg-green-500'
                : 'bg-teal-600 text-white dark:bg-teal-500'
              : 'bg-white text-gray-500 active:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:active:bg-gray-700'
          }`}
        >
          {SPECIES_SHORT[sp]}
        </button>
      ))}
    </div>
  );
}

interface Props {
  records: TreeRecord[];
  setRecords: React.Dispatch<React.SetStateAction<TreeRecord[]>>;
  projectName?: string;
}

export default function InputTab({ records, setRecords, projectName }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const captureRef = useRef<HTMLDivElement>(null);
  const shouldScroll = useRef(false);
  const [exporting, setExporting] = useState(false);

  const locationOptions = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const r of records) {
      const loc = r.location.trim();
      if (loc && !seen.has(loc)) {
        seen.add(loc);
        result.push(loc);
      }
    }
    return result;
  }, [records]);

  const addRow = () => {
    const nextId = records.length > 0 ? Math.max(...records.map((r) => r.id)) + 1 : 1;
    const lastRecord = records[records.length - 1];
    shouldScroll.current = true;
    setRecords([
      ...records,
      {
        id: nextId,
        diameter: 0,
        species: '',
        location: lastRecord?.location ?? '',
      },
    ]);
  };

  useEffect(() => {
    if (shouldScroll.current) {
      shouldScroll.current = false;
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }, [records.length]);

  const removeRow = (id: number) => {
    setRecords(records.filter((r) => r.id !== id));
  };

  const updateRecord = (id: number, field: keyof TreeRecord, value: string | number) => {
    setRecords(records.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const legendItems = [
    { label: '~B10', cls: 'bg-emerald-100 border-emerald-300 dark:bg-emerald-900/40 dark:border-emerald-700' },
    { label: 'B11~20', cls: 'bg-sky-100 border-sky-300 dark:bg-sky-900/40 dark:border-sky-700' },
    { label: 'B21~30', cls: 'bg-amber-100 border-amber-300 dark:bg-amber-900/40 dark:border-amber-700' },
    { label: 'B31~40', cls: 'bg-orange-100 border-orange-300 dark:bg-orange-900/40 dark:border-orange-700' },
    { label: 'B41~50', cls: 'bg-rose-100 border-rose-300 dark:bg-rose-900/40 dark:border-rose-700' },
    { label: 'B51~60', cls: 'bg-purple-100 border-purple-300 dark:bg-purple-900/40 dark:border-purple-700' },
    { label: 'B61~70', cls: 'bg-indigo-100 border-indigo-300 dark:bg-indigo-900/40 dark:border-indigo-700' },
    { label: 'B71~', cls: 'bg-red-200 border-red-400 dark:bg-red-900/40 dark:border-red-700' },
  ];

  const fileName = projectName ? `${projectName}_입력데이터` : '수목_입력데이터';

  const captureTable = async (): Promise<HTMLCanvasElement> => {
    const el = captureRef.current!;
    const wasDark = document.documentElement.classList.contains('dark');
    if (wasDark) document.documentElement.classList.remove('dark');

    el.style.display = 'block';

    const cells = el.querySelectorAll('th, td');
    cells.forEach((cell) => {
      (cell as HTMLElement).style.border = '1px solid #d1d5db';
    });

    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    });

    cells.forEach((cell) => {
      (cell as HTMLElement).style.border = '';
    });
    el.style.display = 'none';

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
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      const pageW = pdf.internal.pageSize.getWidth() - 20;
      const pageH = pdf.internal.pageSize.getHeight() - 20;

      // 폭 기준으로 비율 고정, 페이지 높이에 맞춰 canvas를 세로로 슬라이스
      const scale = pageW / canvas.width;
      const sliceH = Math.floor(pageH / scale); // canvas px 단위 한 페이지 높이

      for (let y = 0; y < canvas.height; y += sliceH) {
        if (y > 0) pdf.addPage();
        const h = Math.min(sliceH, canvas.height - y);
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = h;
        slice.getContext('2d')!.drawImage(
          canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h,
        );
        pdf.addImage(slice.toDataURL('image/png'), 'PNG', 10, 10, pageW, h * scale);
      }

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
        try {
          await navigator.share({ title: fileName, text: '수목 입력 데이터' });
          return;
        } catch {
          // 무시
        }
      }

      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        alert('이미지가 클립보드에 복사되었습니다.\n원하는 앱에 붙여넣기 하세요.');
        return;
      } catch {
        // 무시
      }

      const link = document.createElement('a');
      link.download = `${fileName}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } finally {
      setExporting(false);
    }
  };

  // 캡처 전용 테이블 인라인 스타일 (50행/페이지 기준 컴팩트)
  const cellStyle: React.CSSProperties = {
    border: '1px solid #d1d5db',
    padding: '2px 4px',
    textAlign: 'center',
    fontSize: '11px',
    lineHeight: '1.2',
  };
  const thStyle: React.CSSProperties = {
    ...cellStyle,
    backgroundColor: '#f3f4f6',
    fontWeight: 600,
    color: '#374151',
  };

  return (
    <div>
      {/* 내보내기 버튼 */}
      {records.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
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
        </div>
      )}

      {/* 캡처 전용 숨김 테이블 */}
      <div ref={captureRef} style={{ display: 'none', backgroundColor: '#fff', padding: '8px' }}>
        <div style={{ textAlign: 'center', marginBottom: '6px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827' }}>
            수목 입력 데이터
          </div>
          {projectName && (
            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '1px' }}>{projectName}</div>
          )}
        </div>
        <table style={{ borderCollapse: 'collapse', fontSize: '11px', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, minWidth: '50px' }}>순번</th>
              <th style={{ ...thStyle, minWidth: '80px' }}>흉고직경(cm)</th>
              <th style={{ ...thStyle, minWidth: '80px' }}>수종</th>
              <th style={{ ...thStyle, minWidth: '120px' }}>위치</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, idx) => (
              <tr key={r.id}>
                <td style={{ ...cellStyle, color: '#1f2937' }}>{idx + 1}</td>
                <td style={{ ...cellStyle, color: '#1f2937' }}>{r.diameter || ''}</td>
                <td style={{ ...cellStyle, color: '#1f2937' }}>{r.species}</td>
                <td style={{ ...cellStyle, color: '#1f2937', textAlign: 'left' }}>{r.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 데스크톱: 상단 버튼 */}
      <div className="mb-4 hidden sm:flex sm:items-center gap-3">
        <button
          onClick={addRow}
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-base font-medium
            active:bg-green-700 cursor-pointer"
        >
          + 행 추가
        </button>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {legendItems.map((it) => (
            <span key={it.label} className={`px-2 py-1 rounded border ${it.cls} dark:text-gray-300`}>{it.label}</span>
          ))}
        </div>
      </div>

      {/* 모바일: 카드 레이아웃 - 한 줄 컴팩트 */}
      <div className="flex flex-col gap-2 pb-28 sm:hidden">
        {records.length === 0 && (
          <p className="text-gray-400 dark:text-gray-500 py-12 text-center">
            데이터가 없습니다.<br />하단의 "행 추가" 버튼을 눌러주세요.
          </p>
        )}
        {records.map((r, idx) => (
          <div
            key={r.id}
            className={`border rounded-lg px-2.5 py-2 ${
              diameterColor(r.diameter) || 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
            }`}
          >
            {/* 1줄: 순번 | 직경 | 수종 | 삭제 */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-gray-400 dark:text-gray-500 w-5 text-center shrink-0">
                {idx + 1}
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={r.diameter || ''}
                onChange={(e) => updateRecord(r.id, 'diameter', Number(e.target.value))}
                className="w-14 px-1.5 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm text-center
                  bg-white/70 dark:bg-gray-700/70 text-gray-900 dark:text-gray-100
                  placeholder:text-gray-400 dark:placeholder:text-gray-500 shrink-0"
                placeholder="B"
              />
              <div className="shrink-0">
                <SpeciesToggle
                  value={r.species}
                  onChange={(v) => updateRecord(r.id, 'species', v)}
                />
              </div>
              <LocationComboBox
                value={r.location}
                options={locationOptions}
                onChange={(v) => updateRecord(r.id, 'location', v)}
                className="flex-1 min-w-16 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm
                  bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                  placeholder:text-gray-400 dark:placeholder:text-gray-500"
                placeholder="위치"
              />
              <button
                onClick={() => removeRow(r.id)}
                className="text-red-400 active:text-red-600 cursor-pointer text-sm px-1 shrink-0"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 데스크톱: 테이블 레이아웃 */}
      <div className="overflow-x-auto hidden sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800">
              <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 w-16 text-gray-700 dark:text-gray-300">순번</th>
              <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 w-28 text-gray-700 dark:text-gray-300">흉고직경(cm)</th>
              <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 w-36 text-gray-700 dark:text-gray-300">수종</th>
              <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-700 dark:text-gray-300">위치</th>
              <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 w-16 text-gray-700 dark:text-gray-300">삭제</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr>
                <td colSpan={5} className="border border-gray-300 dark:border-gray-600 px-3 py-8 text-gray-400 dark:text-gray-500 text-center">
                  데이터가 없습니다. "행 추가" 버튼을 눌러주세요.
                </td>
              </tr>
            )}
            {records.map((r, idx) => (
              <tr
                key={r.id}
                className={diameterColor(r.diameter) || 'hover:bg-gray-50 dark:hover:bg-gray-800'}
              >
                <td className="border border-gray-300 dark:border-gray-600 px-3 py-1 text-center text-gray-700 dark:text-gray-300">
                  {idx + 1}
                </td>
                <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                  <input
                    type="number"
                    min={0}
                    value={r.diameter || ''}
                    onChange={(e) => updateRecord(r.id, 'diameter', Number(e.target.value))}
                    className="w-full px-2 py-1 text-center border-0 outline-none bg-transparent
                      text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
                    placeholder="0"
                  />
                </td>
                <td className={`border px-1 py-1 ${
                  r.species === '' ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'
                }`}>
                  <SpeciesToggle
                    value={r.species}
                    onChange={(v) => updateRecord(r.id, 'species', v)}
                  />
                </td>
                <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                  <LocationComboBox
                    value={r.location}
                    options={locationOptions}
                    onChange={(v) => updateRecord(r.id, 'location', v)}
                    className="w-full px-2 py-1 border-0 outline-none bg-transparent
                      text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
                    placeholder="위치 입력"
                  />
                </td>
                <td className="border border-gray-300 dark:border-gray-600 px-1 py-1 text-center">
                  <button
                    onClick={() => removeRow(r.id)}
                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300
                      cursor-pointer px-2"
                    title="삭제"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 모바일: 하단 고정 바 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur
        border-t border-gray-200 dark:border-gray-700 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]
        sm:hidden z-50">
        <div className="flex flex-wrap justify-center gap-1.5 text-xs mb-2">
          {legendItems.map((it) => (
            <span key={it.label} className={`px-2 py-0.5 rounded border ${it.cls} dark:text-gray-300`}>{it.label}</span>
          ))}
        </div>
        <button
          onClick={addRow}
          className="w-full bg-green-600 text-white py-3.5 rounded-xl text-base font-medium
            active:bg-green-700 cursor-pointer"
        >
          + 행 추가
        </button>
      </div>
    </div>
  );
}
