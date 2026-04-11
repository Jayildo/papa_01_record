import { useMemo, useState } from 'react';
import type { WorkLog } from '../types';
import { computeMonthlyStats, listMonths } from '../utils/worklogStats';

interface Props {
  logs: WorkLog[];
  onSelectLog: (log: WorkLog) => void;
}

function formatWon(n: number): string {
  return n.toLocaleString('ko-KR') + '원';
}

export default function WorklogMonthly({ logs, onSelectLog }: Props) {
  const months = useMemo(() => listMonths(logs), [logs]);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => months[0] ?? '');

  const stats = useMemo(
    () => (selectedMonth ? computeMonthlyStats(logs, selectedMonth) : null),
    [logs, selectedMonth],
  );

  if (months.length === 0) {
    return (
      <p className="text-gray-400 dark:text-gray-500 py-12 text-center">
        저장된 작업일지가 없습니다.
      </p>
    );
  }

  const maxLocationAmount = stats?.topLocations[0]?.amount ?? 1;

  return (
    <div className="space-y-4">
      {/* 월 선택 */}
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {months.map((m) => (
          <button
            key={m}
            onClick={() => setSelectedMonth(m)}
            className={`px-4 py-2 rounded-full text-sm font-semibold shrink-0 cursor-pointer transition-colors ${
              selectedMonth === m
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {stats && (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: '총 합계', value: formatWon(stats.total), color: 'text-blue-600 dark:text-blue-400' },
              { label: '작업 건수', value: `${stats.count}건`, color: 'text-gray-700 dark:text-gray-200' },
              { label: '인건비', value: formatWon(stats.laborSum), color: 'text-emerald-600 dark:text-emerald-400' },
              { label: '장비/자재', value: formatWon(stats.itemSum), color: 'text-orange-600 dark:text-orange-400' },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4"
              >
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{label}</p>
                <p className={`text-lg font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* 현장 Top N */}
          {stats.topLocations.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-3 text-sm">현장별 합계</h3>
              <div className="space-y-2.5">
                {stats.topLocations.slice(0, 5).map(({ location, amount }) => (
                  <div key={location}>
                    <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                      <span className="truncate max-w-[60%]">{location}</span>
                      <span className="font-medium">{formatWon(amount)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 dark:bg-blue-400 rounded-full"
                        style={{ width: `${Math.round((amount / maxLocationAmount) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 일자별 드릴다운 */}
          {stats.daily.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <h3 className="font-semibold text-gray-800 dark:text-gray-200 px-4 py-3 border-b border-gray-100 dark:border-gray-700 text-sm">
                일자별 목록
              </h3>
              <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {stats.daily.map((log) => (
                  <button
                    key={log.id}
                    onClick={() => onSelectLog(log)}
                    className="w-full flex items-center justify-between px-4 py-3 cursor-pointer
                      hover:bg-gray-50 dark:hover:bg-gray-700/50 active:bg-gray-100 dark:active:bg-gray-700
                      transition-colors text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {log.workDate}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                        {log.location ?? '(장소 없음)'}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                        {log.totalAmount != null ? formatWon(log.totalAmount) : '-'}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        인력 {log.laborers.length} / 항목 {log.items.length}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
