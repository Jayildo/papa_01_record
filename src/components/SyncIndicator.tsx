import type { SyncStatus } from '../types';

const CONFIG: Record<SyncStatus, { color: string; label: string }> = {
  synced: { color: 'bg-green-500', label: '동기화 완료' },
  syncing: { color: 'bg-yellow-500 animate-pulse', label: '동기화 중...' },
  offline: { color: 'bg-gray-400', label: '오프라인' },
  error: { color: 'bg-red-500', label: '동기화 오류' },
};

interface Props {
  status: SyncStatus;
  errorMsg?: string;
}

export default function SyncIndicator({ status, errorMsg }: Props) {
  const { color, label } = CONFIG[status];
  return (
    <div className="flex items-center gap-1.5" title={errorMsg || label}>
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {status === 'error' && errorMsg ? `오류: ${errorMsg}` : label}
      </span>
    </div>
  );
}
