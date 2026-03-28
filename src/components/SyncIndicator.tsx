import type { SyncStatus } from '../types';

const CONFIG: Record<SyncStatus, { color: string; bgColor: string; label: string }> = {
  synced: { color: 'bg-green-500', bgColor: '', label: '동기화 완료' },
  syncing: { color: 'bg-yellow-500 animate-pulse', bgColor: '', label: '동기화 중...' },
  offline: { color: 'bg-gray-400', bgColor: 'bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700', label: '오프라인 — 로컬에 저장됨' },
  error: { color: 'bg-red-500', bgColor: 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700', label: '동기화 오류' },
};

interface Props {
  status: SyncStatus;
  errorMsg?: string;
  onRetry?: () => void;
}

export default function SyncIndicator({ status, errorMsg, onRetry }: Props) {
  const { color, bgColor, label } = CONFIG[status];

  // 에러/오프라인 시 강조 배너
  if (status === 'error' || status === 'offline') {
    return (
      <div className={`flex items-center gap-1.5 rounded px-2 py-1 ${bgColor}`} role="status" aria-live="assertive">
        <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
        <span className={`text-xs ${status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-yellow-700 dark:text-yellow-300'}`}>
          {status === 'error' && errorMsg ? errorMsg : label}
        </span>
        {status === 'error' && onRetry && (
          <button
            onClick={onRetry}
            className="text-xs text-red-600 dark:text-red-400 underline cursor-pointer ml-1 shrink-0"
          >
            재시도
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5" title={errorMsg || label} role="status" aria-live="polite">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
    </div>
  );
}
