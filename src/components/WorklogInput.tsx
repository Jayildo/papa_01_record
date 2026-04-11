import { useEffect, useState } from 'react';
import type { WorkLog, WorkLogItem, WorkLogLaborer } from '../types';
import { upsertWorkLog, deleteWorkLog } from '../lib/worklogSupabase';
import LocationComboBox from './LocationComboBox';

interface Props {
  logs: WorkLog[];
  workerNames: string[];
  selectedLogId: string | null;
  onSelectLogId: (id: string | null) => void;
  onReload: () => void;
}

const ITEM_CATEGORIES = ['장비', '자재', '식대', '기타'];

function emptyLaborer(sortOrder: number): WorkLogLaborer {
  return { id: crypto.randomUUID(), name: '', sortOrder };
}

function emptyItem(sortOrder: number): WorkLogItem {
  return { id: crypto.randomUUID(), sortOrder };
}

function emptyLog(): WorkLog {
  return {
    id: crypto.randomUUID(),
    workDate: new Date().toISOString().slice(0, 10),
    laborers: [emptyLaborer(0)],
    items: [emptyItem(0)],
  };
}

function computeAutoTotal(log: WorkLog): number {
  const laborSum = log.laborers.reduce((s, l) => s + (l.dailyWage ?? 0), 0);
  const itemSum = log.items.reduce((s, it) => s + (it.amount ?? 0), 0);
  return laborSum + itemSum;
}

function formatWon(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}

export default function WorklogInput({ logs, workerNames, selectedLogId, onSelectLogId, onReload }: Props) {
  const [form, setForm] = useState<WorkLog>(emptyLog);
  const [overrideTotal, setOverrideTotal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [deleting, setDeleting] = useState(false);

  const locations = Array.from(new Set(logs.map((l) => l.location).filter(Boolean) as string[]));

  // sync form when selection changes
  useEffect(() => {
    if (selectedLogId === null) {
      const newLog = emptyLog();
      setForm(newLog);
      setOverrideTotal(false);
      return;
    }
    const found = logs.find((l) => l.id === selectedLogId);
    if (found) {
      setForm(structuredClone(found));
      setOverrideTotal(found.totalAmount !== undefined);
    }
  }, [selectedLogId, logs]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  function setField<K extends keyof WorkLog>(key: K, value: WorkLog[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // ---- Laborer helpers ----
  function setLaborer(idx: number, patch: Partial<WorkLogLaborer>) {
    setForm((prev) => {
      const next = [...prev.laborers];
      next[idx] = { ...next[idx], ...patch };
      return { ...prev, laborers: next };
    });
  }
  function addLaborer() {
    setForm((prev) => ({
      ...prev,
      laborers: [...prev.laborers, emptyLaborer(prev.laborers.length)],
    }));
  }
  function removeLaborer(idx: number) {
    setForm((prev) => ({
      ...prev,
      laborers: prev.laborers.filter((_, i) => i !== idx).map((l, i) => ({ ...l, sortOrder: i })),
    }));
  }

  // ---- Item helpers ----
  function setItem(idx: number, patch: Partial<WorkLogItem>) {
    setForm((prev) => {
      const next = [...prev.items];
      next[idx] = { ...next[idx], ...patch };
      return { ...prev, items: next };
    });
  }
  function addItem() {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, emptyItem(prev.items.length)],
    }));
  }
  function removeItem(idx: number) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx).map((it, i) => ({ ...it, sortOrder: i })),
    }));
  }

  const autoTotal = computeAutoTotal(form);
  const displayTotal = overrideTotal ? (form.totalAmount ?? 0) : autoTotal;

  async function handleSave() {
    if (!form.workDate) { showToast('일자를 입력하세요.'); return; }
    setSaving(true);
    try {
      const logToSave: WorkLog = {
        ...form,
        totalAmount: overrideTotal ? form.totalAmount : autoTotal || undefined,
      };
      await upsertWorkLog(logToSave);
      onSelectLogId(form.id);
      onReload();
      showToast('저장되었습니다.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '저장 오류');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedLogId) return;
    if (!confirm('이 작업일지를 삭제하시겠습니까?')) return;
    setDeleting(true);
    try {
      await deleteWorkLog(selectedLogId);
      onSelectLogId(null);
      onReload();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '삭제 오류');
    } finally {
      setDeleting(false);
    }
  }

  const inputClass = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500';
  const labelClass = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* 목록 패널 */}
      <div className="lg:w-64 shrink-0">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">작업일지 목록</span>
            <button
              onClick={() => onSelectLogId(null)}
              className="text-xs px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 cursor-pointer"
            >
              + 새로
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-50 dark:divide-gray-700/50">
            {logs.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-4 text-center">없음</p>
            )}
            {logs.map((log) => (
              <button
                key={log.id}
                onClick={() => onSelectLogId(log.id)}
                className={`w-full text-left px-3 py-2.5 cursor-pointer transition-colors ${
                  log.id === selectedLogId
                    ? 'bg-blue-50 dark:bg-blue-900/30'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{log.workDate}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                  {log.location ?? '(장소 없음)'}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 편집 폼 */}
      <div className="flex-1 min-w-0">
        {/* 헤더 필드 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4 text-sm">헤더 정보</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass}>일자 *</label>
              <input
                type="date"
                value={form.workDate}
                onChange={(e) => setField('workDate', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>날씨</label>
              <input
                type="text"
                value={form.weather ?? ''}
                onChange={(e) => setField('weather', e.target.value || undefined)}
                placeholder="맑음"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>기온</label>
              <input
                type="text"
                value={form.temperature ?? ''}
                onChange={(e) => setField('temperature', e.target.value || undefined)}
                placeholder="-11 ~ 2"
                className={inputClass}
              />
            </div>
            <div className="col-span-2 sm:col-span-3">
              <label className={labelClass}>작업장소</label>
              <LocationComboBox
                value={form.location ?? ''}
                options={locations}
                onChange={(v) => setField('location', v || undefined)}
                className={inputClass}
                placeholder="현장 주소 또는 이름"
              />
            </div>
            <div className="col-span-2 sm:col-span-3">
              <label className={labelClass}>작업내용</label>
              <textarea
                value={form.workDesc ?? ''}
                onChange={(e) => setField('workDesc', e.target.value || undefined)}
                rows={2}
                placeholder="작업 내용을 입력하세요"
                className={inputClass + ' resize-none'}
              />
            </div>
            <div className="col-span-2 sm:col-span-3">
              <label className={labelClass}>총합계</label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={overrideTotal}
                    onChange={(e) => {
                      setOverrideTotal(e.target.checked);
                      if (!e.target.checked) setField('totalAmount', undefined);
                    }}
                    className="rounded"
                  />
                  수동 입력
                </label>
                {overrideTotal ? (
                  <input
                    type="number"
                    value={form.totalAmount ?? ''}
                    onChange={(e) => setField('totalAmount', e.target.value ? Number(e.target.value) : undefined)}
                    className={inputClass + ' w-40'}
                    min={0}
                    step={1000}
                  />
                ) : (
                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                    {formatWon(displayTotal)} (자동)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 투입 인력 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 text-sm">투입 인력</h3>
            <button
              onClick={addLaborer}
              className="text-xs px-2.5 py-1 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 cursor-pointer"
            >
              + 행 추가
            </button>
          </div>
          <div className="space-y-2">
            {form.laborers.map((laborer, idx) => (
              <div key={laborer.id} className="flex gap-2 items-start">
                <div className="flex-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="col-span-2 sm:col-span-1">
                    <input
                      list="worker-names-list"
                      type="text"
                      value={laborer.name}
                      onChange={(e) => setLaborer(idx, { name: e.target.value })}
                      placeholder="이름"
                      className={inputClass}
                    />
                  </div>
                  <input
                    type="text"
                    value={laborer.residentId ?? ''}
                    onChange={(e) => setLaborer(idx, { residentId: e.target.value || undefined })}
                    placeholder="주민등록번호"
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={laborer.company ?? ''}
                    onChange={(e) => setLaborer(idx, { company: e.target.value || undefined })}
                    placeholder="소속"
                    className={inputClass}
                  />
                  <input
                    type="number"
                    value={laborer.dailyWage ?? ''}
                    onChange={(e) => setLaborer(idx, { dailyWage: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="일당"
                    className={inputClass}
                    min={0}
                    step={10000}
                  />
                </div>
                <button
                  onClick={() => removeLaborer(idx)}
                  className="mt-0.5 text-red-400 hover:text-red-600 cursor-pointer px-1 py-2 shrink-0 text-lg leading-none"
                  title="삭제"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <datalist id="worker-names-list">
            {workerNames.map((n) => <option key={n} value={n} />)}
          </datalist>
        </div>

        {/* 장비/자재/기타 */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 text-sm">장비 / 자재 / 기타</h3>
            <button
              onClick={addItem}
              className="text-xs px-2.5 py-1 rounded bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 cursor-pointer"
            >
              + 행 추가
            </button>
          </div>
          <div className="space-y-2">
            {form.items.map((item, idx) => (
              <div key={item.id} className="flex gap-2 items-start">
                <div className="flex-1 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <select
                    value={item.category ?? ''}
                    onChange={(e) => setItem(idx, { category: e.target.value || undefined })}
                    className={inputClass}
                  >
                    <option value="">구분</option>
                    {ITEM_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={item.detail ?? ''}
                    onChange={(e) => setItem(idx, { detail: e.target.value || undefined })}
                    placeholder="세부"
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={item.unit ?? ''}
                    onChange={(e) => setItem(idx, { unit: e.target.value || undefined })}
                    placeholder="단위"
                    className={inputClass}
                  />
                  <input
                    type="number"
                    value={item.qty ?? ''}
                    onChange={(e) => setItem(idx, { qty: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="수량"
                    className={inputClass}
                    min={0}
                  />
                  <input
                    type="number"
                    value={item.amount ?? ''}
                    onChange={(e) => setItem(idx, { amount: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="금액"
                    className={inputClass}
                    min={0}
                    step={1000}
                  />
                </div>
                <button
                  onClick={() => removeItem(idx)}
                  className="mt-0.5 text-red-400 hover:text-red-600 cursor-pointer px-1 py-2 shrink-0 text-lg leading-none"
                  title="삭제"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 저장/삭제 버튼 */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium cursor-pointer
              active:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
          {selectedLogId && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-5 py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400
                border border-red-200 dark:border-red-700 rounded-xl font-medium cursor-pointer
                active:bg-red-100 dark:active:bg-red-900/40 disabled:opacity-50 text-sm"
            >
              {deleting ? '삭제 중...' : '삭제'}
            </button>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 dark:bg-gray-700 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg z-50">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
