import { useRef, useState } from 'react';
import { parseWorklogCsv } from '../utils/worklogCsvParser';
import { bulkImportWorkLogs } from '../lib/worklogSupabase';
import type { WorkLog } from '../types';

interface Props {
  onImported: () => void;
}

function formatWon(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}

export default function WorklogImport({ onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<WorkLog[]>([]);
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setResult(null);
    setParseError('');
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const logs = parseWorklogCsv(text);
        setPreview(logs);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : '파싱 오류');
        setPreview([]);
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  async function handleImport() {
    if (preview.length === 0) return;
    setImporting(true);
    try {
      const res = await bulkImportWorkLogs(preview);
      setResult(res);
      setPreview([]);
      if (fileRef.current) fileRef.current.value = '';
      onImported();
    } catch (err) {
      setParseError(err instanceof Error ? err.message : '가져오기 오류');
    } finally {
      setImporting(false);
    }
  }

  const displayLogs = preview.slice(0, 20);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">CSV 파일 가져오기</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          작업일지 CSV 파일을 선택하면 미리보기 후 가져올 수 있습니다.
          external_id 가 같은 항목은 자동으로 건너뜁니다.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={handleFile}
          className="block w-full text-sm text-gray-600 dark:text-gray-400
            file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0
            file:text-sm file:font-medium file:cursor-pointer
            file:bg-blue-50 file:text-blue-700
            dark:file:bg-blue-900/30 dark:file:text-blue-300"
        />
        {parseError && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{parseError}</p>
        )}
      </div>

      {result && (
        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-xl p-4 text-sm text-green-700 dark:text-green-300">
          가져오기 완료 — 신규: {result.inserted}건, 건너뜀: {result.skipped}건
        </div>
      )}

      {preview.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <span className="font-medium text-gray-800 dark:text-gray-200 text-sm">
              미리보기 ({preview.length}건 파싱됨{preview.length > 20 ? ', 앞 20건 표시' : ''})
            </span>
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium
                cursor-pointer active:bg-blue-700 disabled:opacity-50"
            >
              {importing ? '가져오는 중...' : '가져오기'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                  <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">ID</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">일자</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">작업장소</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">합계</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">인력</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">장비/자재</th>
                </tr>
              </thead>
              <tbody>
                {displayLogs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-50 dark:border-gray-700/50">
                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400 font-mono">{log.externalId ?? '-'}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{log.workDate}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[200px] truncate">{log.location ?? '-'}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap text-right">
                      {log.totalAmount != null ? formatWon(log.totalAmount) : '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{log.laborers.length}명</td>
                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{log.items.length}건</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
