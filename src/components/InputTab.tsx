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
  disabled?: boolean;
  onSave?: () => void;
  isDirty?: boolean;
  syncStatus?: string;
  sealed?: boolean;
}

export default function InputTab({ records, setRecords, projectName, disabled = false, onSave, isDirty, syncStatus, sealed = false }: Props) {
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

  // 마지막 행이 미완성이면 행 추가 차단
  const lastRecord = records[records.length - 1];
  const lastRowIncomplete = !!lastRecord && (
    lastRecord.diameter <= 0 || lastRecord.species === '' || !lastRecord.location.trim()
  );

  const addRow = () => {
    if (sealed) return;
    if (lastRowIncomplete) {
      const missing: string[] = [];
      if (lastRecord.diameter <= 0) missing.push('흉고직경');
      if (lastRecord.species === '') missing.push('수종');
      if (!lastRecord.location.trim()) missing.push('위치');
      alert(`${missing.join(', ')}을(를) 입력해주세요.`);
      return;
    }

    const nextId = records.reduce((min, r) => Math.min(min, r.id), 0) - 1;
    shouldScroll.current = true;
    setRecords([
      ...records,
      {
        id: nextId,
        diameter: 0,
        species: lastRecord?.species ?? '',
        location: lastRecord?.location ?? '',
        note: '',
        _syncState: 'draft',
      },
    ]);
  };

  useEffect(() => {
    if (shouldScroll.current) {
      shouldScroll.current = false;
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
          const el = document.querySelector<HTMLInputElement>('[data-last-diameter]');
          if (el && el.offsetParent !== null) el.focus();
          else {
            // 모바일: 숨겨진 데스크톱 input 건너뛰고 보이는 것 찾기
            const all = document.querySelectorAll<HTMLInputElement>('[data-last-diameter]');
            for (const input of all) {
              if (input.offsetParent !== null) { input.focus(); break; }
            }
          }
        }, 300);
      });
    }
  }, [records.length]);

  // 자동 행 추가: 마지막 행 완성 후 2초 디바운스
  // synced 상태(기존 데이터)에서는 발동하지 않음 — 새로 입력한 행(pending)만 대상
  const lastRowComplete = !!lastRecord && lastRecord.diameter > 0
    && lastRecord.species !== '' && lastRecord.location.trim() !== ''
    && lastRecord._syncState !== 'synced';

  useEffect(() => {
    if (!lastRowComplete || disabled || sealed) return;
    const timer = setTimeout(() => {
      addRow();
    }, 700);
    return () => clearTimeout(timer);
  }, [lastRowComplete, lastRecord?.diameter]);

  const removeRow = (id: number) => {
    if (sealed) return;
    setRecords(records.filter((r) => r.id !== id));
  };

  const updateRecord = (id: number, field: keyof TreeRecord, value: string | number) => {
    if (sealed) return;
    setRecords(records.map((r) => {
      if (r.id !== id) return r;
      const updated = { ...r, [field]: value };
      // 상태 전환: draft/synced → pending (모든 필드 입력 완료 시)
      if (updated._syncState === 'draft') {
        const isComplete = updated.diameter > 0 && updated.species !== '' && updated.location.trim() !== '';
        if (isComplete) {
          updated._syncState = 'pending';
        }
      } else if (updated._syncState === 'synced') {
        // 기존 레코드 수정 시 pending으로
        updated._syncState = 'pending';
      }
      return updated;
    }));
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

  const fileName = (projectName ? `${projectName}_입력데이터` : '수목_입력데이터').replace(/[/\\:*?"<>|]/g, '_');

  const downloadCsv = () => {
    const header = '순번,흉고직경(cm),수종,위치,비고';
    const rows = records.map((r, i) =>
      `${i + 1},${r.diameter},${r.species},${r.location.replace(/,/g, ' ')},${(r.note ?? '').replace(/,/g, ' ')}`
    );
    const csv = '\uFEFF' + [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.download = `${fileName}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const captureTable = async (): Promise<HTMLCanvasElement> => {
    const el = captureRef.current!;
    const wasDark = document.documentElement.classList.contains('dark');
    if (wasDark) document.documentElement.classList.remove('dark');

    el.style.display = 'block';
    el.style.width = '800px'; // 고정 폭 → A4에서 ~50행/페이지

    const cells = el.querySelectorAll('th, td');
    cells.forEach((cell) => {
      (cell as HTMLElement).style.border = '1px solid #d1d5db';
    });

    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });
      return canvas;
    } finally {
      // 항상 복원
      cells.forEach((cell) => {
        (cell as HTMLElement).style.border = '';
      });
      el.style.width = '';
      el.style.display = 'none';
      if (wasDark) document.documentElement.classList.add('dark');
    }
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
    const el = captureRef.current!;
    const wasDark = document.documentElement.classList.contains('dark');
    if (wasDark) document.documentElement.classList.remove('dark');

    el.style.display = 'block';
    el.style.width = '800px';

    const cells = el.querySelectorAll('th, td');
    cells.forEach((cell) => {
      (cell as HTMLElement).style.border = '1px solid #d1d5db';
    });

    const allRows = el.querySelectorAll('tbody tr');
    const titleEl = el.querySelector(':scope > div') as HTMLElement; // 제목 영역

    try {
      const ROWS_PER_PAGE = 50;
      const totalPages = Math.max(1, Math.ceil(allRows.length / ROWS_PER_PAGE));

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth() - 20;
      const pageH = pdf.internal.pageSize.getHeight() - 20;

      for (let page = 0; page < totalPages; page++) {
        // 해당 페이지 범위 외 행 숨기기
        const start = page * ROWS_PER_PAGE;
        const end = start + ROWS_PER_PAGE;
        allRows.forEach((tr, i) => {
          (tr as HTMLElement).style.display = (i >= start && i < end) ? '' : 'none';
        });

        // 제목은 첫 페이지만
        if (page > 0) titleEl.style.display = 'none';

        const canvas = await html2canvas(el, {
          scale: 2,
          backgroundColor: '#ffffff',
          useCORS: true,
        });

        if (page > 0) pdf.addPage();
        const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
        pdf.addImage(
          canvas.toDataURL('image/png'), 'PNG',
          10, 10, canvas.width * ratio, canvas.height * ratio,
        );
      }

      pdf.save(`${fileName}.pdf`);
    } finally {
      // 항상 복원
      allRows.forEach((tr) => { (tr as HTMLElement).style.display = ''; });
      titleEl.style.display = '';
      cells.forEach((cell) => { (cell as HTMLElement).style.border = ''; });
      el.style.width = '';
      el.style.display = 'none';
      if (wasDark) document.documentElement.classList.add('dark');
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
      {/* 확정 상태 배너 */}
      {sealed && (
        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg px-3 py-2 mb-3 text-sm text-green-700 dark:text-green-300 text-center font-medium">
          확정된 프로젝트입니다 (읽기 전용)
        </div>
      )}

      {/* 내보내기 버튼 */}
      {records.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          {onSave && (
            <button
              onClick={() => {
                const invalid = records.filter(r => r.diameter > 0 && r.species === '');
                if (invalid.length > 0) {
                  alert(`수종이 선택되지 않은 레코드가 ${invalid.length}건 있습니다.\n수종을 선택한 후 저장해주세요.`);
                  return;
                }
                onSave?.();
              }}
              disabled={!isDirty || syncStatus === 'syncing'}
              className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
                isDirty
                  ? 'bg-blue-600 text-white active:bg-blue-700'
                  : 'bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
              } disabled:opacity-50`}
            >
              {syncStatus === 'syncing' ? '저장 중...' : isDirty ? '저장' : '저장됨'}
            </button>
          )}
          <button
            onClick={downloadPng}
            disabled={exporting}
            aria-label="PNG 다운로드"
            className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium
              cursor-pointer active:bg-emerald-700 disabled:opacity-50"
          >
            PNG
          </button>
          <button
            onClick={downloadPdf}
            disabled={exporting}
            aria-label="PDF 다운로드"
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium
              cursor-pointer active:bg-blue-700 disabled:opacity-50"
          >
            PDF
          </button>
          <button
            onClick={sharePng}
            disabled={exporting}
            aria-label="이미지 공유"
            className="px-3 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium
              cursor-pointer active:bg-violet-700 disabled:opacity-50"
          >
            공유
          </button>
          <button
            onClick={downloadCsv}
            aria-label="CSV 다운로드"
            className="px-3 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium
              cursor-pointer active:bg-gray-700 disabled:opacity-50"
          >
            CSV
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
              <th style={{ ...thStyle, minWidth: '100px' }}>비고</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, idx) => (
              <tr key={r.id}>
                <td style={{ ...cellStyle, color: '#1f2937' }}>{idx + 1}</td>
                <td style={{ ...cellStyle, color: '#1f2937' }}>{r.diameter || ''}</td>
                <td style={{ ...cellStyle, color: '#1f2937' }}>{r.species}</td>
                <td style={{ ...cellStyle, color: '#1f2937', textAlign: 'left' }}>{r.location}</td>
                <td style={{ ...cellStyle, color: '#1f2937', textAlign: 'left' }}>{r.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 데스크톱: 상단 버튼 (스크롤 시 고정) */}
      <div className="mb-4 hidden sm:flex sm:items-center gap-3 sticky top-0 z-40 bg-gray-50 dark:bg-gray-900 py-2 -mt-2">
        <button
          onClick={addRow}
          disabled={disabled || lastRowIncomplete}
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-base font-medium
            active:bg-green-700 cursor-pointer disabled:opacity-50"
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
      <div className={`flex flex-col gap-2 pb-28 sm:hidden ${sealed ? 'pointer-events-none opacity-60' : ''}`}>
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
            {/* 1줄: 순번 | 직경 | 수종 | 위치 | 비고 | 삭제 */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-gray-400 dark:text-gray-500 w-5 text-center shrink-0">
                {idx + 1}
              </span>
              <input
                data-last-diameter={idx === records.length - 1 || undefined}
                data-diameter-row={r.id}
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
                  onChange={(v) => {
                    updateRecord(r.id, 'species', v);
                    requestAnimationFrame(() => {
                      const inputs = document.querySelectorAll<HTMLInputElement>(`[data-diameter-row="${r.id}"]`);
                      for (const input of inputs) {
                        if (input.offsetParent !== null) { input.focus(); break; }
                      }
                    });
                  }}
                />
              </div>
              <LocationComboBox
                value={r.location}
                options={locationOptions}
                onChange={(v) => updateRecord(r.id, 'location', v)}
                className="min-w-12 max-w-20 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm
                  bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                  placeholder:text-gray-400 dark:placeholder:text-gray-500"
                placeholder="위치"
              />
              <input
                type="text"
                value={r.note ?? ''}
                onChange={(e) => updateRecord(r.id, 'note', e.target.value)}
                className="flex-1 min-w-12 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm
                  bg-white/70 dark:bg-gray-700/70 text-gray-700 dark:text-gray-300
                  placeholder:text-gray-300 dark:placeholder:text-gray-500"
                placeholder="비고"
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
      <div className={`overflow-x-auto hidden sm:block ${sealed ? 'pointer-events-none opacity-60' : ''}`}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-800">
              <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 w-16 text-gray-700 dark:text-gray-300">순번</th>
              <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 w-28 text-gray-700 dark:text-gray-300">흉고직경(cm)</th>
              <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 w-36 text-gray-700 dark:text-gray-300">수종</th>
              <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-700 dark:text-gray-300">위치</th>
              <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-700 dark:text-gray-300">비고</th>
              <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 w-16 text-gray-700 dark:text-gray-300">삭제</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr>
                <td colSpan={6} className="border border-gray-300 dark:border-gray-600 px-3 py-8 text-gray-400 dark:text-gray-500 text-center">
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
                    data-last-diameter={idx === records.length - 1 || undefined}
                    data-diameter-row={r.id}
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
                    onChange={(v) => {
                      updateRecord(r.id, 'species', v);
                      requestAnimationFrame(() => {
                        const inputs = document.querySelectorAll<HTMLInputElement>(`[data-diameter-row="${r.id}"]`);
                        for (const input of inputs) {
                          if (input.offsetParent !== null) { input.focus(); break; }
                        }
                      });
                    }}
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
                <td className="border border-gray-300 dark:border-gray-600 px-1 py-1">
                  <input
                    type="text"
                    value={r.note ?? ''}
                    onChange={(e) => updateRecord(r.id, 'note', e.target.value)}
                    className="w-full px-2 py-1 border-0 outline-none bg-transparent
                      text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
                    placeholder="비고"
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

      {/* 모바일: 좌측 플로팅 행 추가 버튼 (키패드 위에 보이도록) */}
      {!sealed && <button
        onClick={addRow}
        disabled={lastRowIncomplete || disabled}
        className="fixed left-3 bottom-20 sm:hidden z-50
          w-12 h-12 rounded-full bg-green-600 text-white text-2xl font-bold
          shadow-lg active:bg-green-700 cursor-pointer disabled:opacity-30
          flex items-center justify-center"
      >
        +
      </button>}

      {/* 모바일: 하단 고정 바 (저장만) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur
        border-t border-gray-200 dark:border-gray-700 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]
        sm:hidden z-50">
        <div className="flex justify-end">
          {onSave && (
            <button
              onClick={() => {
                const invalid = records.filter(r => r.diameter > 0 && r.species === '');
                if (invalid.length > 0) {
                  alert(`수종이 선택되지 않은 레코드가 ${invalid.length}건 있습니다.\n수종을 선택한 후 저장해주세요.`);
                  return;
                }
                onSave?.();
              }}
              disabled={!isDirty || syncStatus === 'syncing'}
              className={`px-6 py-3.5 rounded-xl text-base font-medium cursor-pointer transition-colors ${
                isDirty
                  ? 'bg-blue-600 text-white active:bg-blue-700'
                  : 'bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500'
              } disabled:opacity-50`}
            >
              {syncStatus === 'syncing' ? '저장 중...' : isDirty ? '저장' : '✓'}
            </button>
          )}
        </div>
      </div>

      {disabled && !sealed && (
        <div className="fixed inset-0 z-[90] bg-black/20 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 px-6 py-3 rounded-xl shadow-lg text-sm font-medium text-gray-700 dark:text-gray-200">
            이력 복원 중...
          </div>
        </div>
      )}
    </div>
  );
}
