import { useMemo } from 'react';
import type { TreeRecord } from '../types';
import LocationComboBox from './LocationComboBox';

function diameterColor(d: number): string {
  if (!d || d <= 0) return '';
  if (d <= 10) return 'bg-emerald-100 border-emerald-300 dark:bg-emerald-900/40 dark:border-emerald-700';
  if (d <= 20) return 'bg-sky-100 border-sky-300 dark:bg-sky-900/40 dark:border-sky-700';
  if (d <= 30) return 'bg-amber-100 border-amber-300 dark:bg-amber-900/40 dark:border-amber-700';
  if (d <= 40) return 'bg-orange-100 border-orange-300 dark:bg-orange-900/40 dark:border-orange-700';
  return 'bg-rose-100 border-rose-300 dark:bg-rose-900/40 dark:border-rose-700';
}

function diameterLabel(d: number): string {
  if (!d || d <= 0) return '';
  if (d <= 10) return '~B10';
  if (d <= 20) return 'B11~20';
  if (d <= 30) return 'B21~30';
  if (d <= 40) return 'B31~40';
  return 'B41~';
}

const SPECIES_OPTIONS: Array<'낙엽수' | '상록수'> = ['낙엽수', '상록수'];

function SpeciesToggle({
  value,
  onChange,
}: {
  value: TreeRecord['species'];
  onChange: (v: '낙엽수' | '상록수') => void;
}) {
  const hasError = value === '';
  return (
    <div>
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
            className={`px-4 py-2 text-sm cursor-pointer transition-colors font-medium ${
              value === sp
                ? sp === '낙엽수'
                  ? 'bg-green-600 text-white dark:bg-green-500'
                  : 'bg-teal-600 text-white dark:bg-teal-500'
                : 'bg-white text-gray-500 active:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:active:bg-gray-700'
            }`}
          >
            {sp}
          </button>
        ))}
      </div>
      {hasError && <p className="text-red-500 dark:text-red-400 text-xs mt-1">수종을 선택하세요</p>}
    </div>
  );
}

interface Props {
  records: TreeRecord[];
  setRecords: React.Dispatch<React.SetStateAction<TreeRecord[]>>;
}

export default function InputTab({ records, setRecords }: Props) {
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
    { label: 'B41~', cls: 'bg-rose-100 border-rose-300 dark:bg-rose-900/40 dark:border-rose-700' },
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

      {/* 모바일: 카드 레이아웃 */}
      <div className="flex flex-col gap-3 pb-32 sm:hidden">
        {records.length === 0 && (
          <p className="text-gray-400 dark:text-gray-500 py-12 text-center">
            데이터가 없습니다.<br />하단의 "행 추가" 버튼을 눌러주세요.
          </p>
        )}
        {records.map((r, idx) => (
          <div
            key={r.id}
            className={`border rounded-xl p-4 shadow-sm ${
              diameterColor(r.diameter) || 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
            }`}
          >
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-bold text-gray-400 dark:text-gray-500">
                #{idx + 1}
                {r.diameter > 0 && (
                  <span className="ml-2 text-gray-600 dark:text-gray-300">{diameterLabel(r.diameter)}</span>
                )}
              </span>
              <button
                onClick={() => removeRow(r.id)}
                className="text-red-400 active:text-red-600 cursor-pointer text-sm px-3 py-1
                  rounded-lg active:bg-red-50 dark:active:bg-red-900/20"
              >
                삭제
              </button>
            </div>

            {/* 흉고직경 + 수종 한 줄 */}
            <div className="flex items-end gap-3 mb-3">
              <div className="flex-1">
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">흉고직경(cm)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={r.diameter || ''}
                  onChange={(e) => updateRecord(r.id, 'diameter', Number(e.target.value))}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-base
                    bg-white/70 dark:bg-gray-700/70 text-gray-900 dark:text-gray-100
                    placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">수종</label>
                <SpeciesToggle
                  value={r.species}
                  onChange={(v) => updateRecord(r.id, 'species', v)}
                />
              </div>
            </div>

            {/* 위치 */}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">위치</label>
              <LocationComboBox
                value={r.location}
                options={locationOptions}
                onChange={(v) => updateRecord(r.id, 'location', v)}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-base
                  bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                  placeholder:text-gray-400 dark:placeholder:text-gray-500"
                placeholder="위치 입력"
              />
            </div>
          </div>
        ))}
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
