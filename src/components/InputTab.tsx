import { useMemo, useRef, useEffect } from 'react';
import type { TreeRecord } from '../types';
import LocationComboBox from './LocationComboBox';

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
}

export default function InputTab({ records, setRecords }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const shouldScroll = useRef(false);

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

  return (
    <div>
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
