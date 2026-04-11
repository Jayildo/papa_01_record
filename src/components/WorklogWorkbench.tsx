import { useCallback, useEffect, useState } from 'react';
import { fetchWorkLogs } from '../lib/worklogSupabase';
import { supabase } from '../lib/supabase';
import type { WorkLog } from '../types';
import WorklogInput from './WorklogInput';
import WorklogMonthly from './WorklogMonthly';
import WorklogImport from './WorklogImport';

type WorklogTab = 'input' | 'monthly' | 'import';

export default function WorklogWorkbench() {
  const [tab, setTab] = useState<WorklogTab>('input');
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [workerNames, setWorkerNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await fetchWorkLogs();
      setLogs(data);
    } catch (err) {
      console.error('fetchWorkLogs:', err);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await reload();
      // load worker names from pool for datalist autocomplete
      try {
        const { data } = await supabase
          .from('labor_worker_pool')
          .select('name')
          .is('deleted_at', null)
          .order('name');
        if (data) {
          setWorkerNames(data.map((r: { name: string }) => r.name).filter(Boolean));
        }
      } catch {
        // non-fatal
      }
      setLoading(false);
    })();
  }, [reload]);

  function handleMonthlySelectLog(log: WorkLog) {
    setSelectedLogId(log.id);
    setTab('input');
  }

  const tabButtonClass = (t: WorklogTab) =>
    `px-4 py-2 rounded-full text-sm font-semibold cursor-pointer transition-colors ${
      tab === t
        ? 'bg-blue-600 text-white'
        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
    }`;

  if (loading) {
    return (
      <p className="text-gray-400 dark:text-gray-500 text-center py-12">로딩 중...</p>
    );
  }

  return (
    <div>
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        <button className={tabButtonClass('input')} onClick={() => setTab('input')}>
          입력
        </button>
        <button className={tabButtonClass('monthly')} onClick={() => setTab('monthly')}>
          월별 통계
        </button>
        <button className={tabButtonClass('import')} onClick={() => setTab('import')}>
          가져오기
        </button>
      </div>

      {tab === 'input' && (
        <WorklogInput
          logs={logs}
          workerNames={workerNames}
          selectedLogId={selectedLogId}
          onSelectLogId={setSelectedLogId}
          onReload={reload}
        />
      )}
      {tab === 'monthly' && (
        <WorklogMonthly logs={logs} onSelectLog={handleMonthlySelectLog} />
      )}
      {tab === 'import' && (
        <WorklogImport onImported={reload} />
      )}
    </div>
  );
}
