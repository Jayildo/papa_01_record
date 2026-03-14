import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { TreeRecord } from '../types';

interface HistoryEntry {
  id: number;
  record_id: number;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  created_at: string;
}

interface HistoryEvent {
  timestamp: string;
  lastTimestamp: string;
  entries: HistoryEntry[];
  summary: string;
  totalRecords?: number;
}

interface Props {
  projectId: string;
  onRestore: (records: TreeRecord[]) => void;
  onClose: () => void;
}

function groupIntoEvents(entries: HistoryEntry[]): HistoryEvent[] {
  if (entries.length === 0) return [];

  // entries are in DESC order. Reverse to process chronologically for counting.
  const chronological = [...entries].reverse();

  // Track active record IDs
  const activeRecords = new Set<number>();

  const groups: HistoryEntry[][] = [];
  let currentGroup: HistoryEntry[] = [chronological[0]];
  let groupTime = new Date(chronological[0].created_at).getTime();

  for (let i = 1; i < chronological.length; i++) {
    const entryTime = new Date(chronological[i].created_at).getTime();
    if (Math.abs(entryTime - groupTime) <= 3000) {
      currentGroup.push(chronological[i]);
    } else {
      groups.push(currentGroup);
      currentGroup = [chronological[i]];
      groupTime = entryTime;
    }
  }
  groups.push(currentGroup);

  // Build events with running total
  const events: HistoryEvent[] = [];
  for (const group of groups) {
    for (const entry of group) {
      if (entry.action === 'insert' || entry.action === 'restore') {
        activeRecords.add(entry.record_id);
      } else if (entry.action === 'delete') {
        activeRecords.delete(entry.record_id);
      }
      // update doesn't change count
    }
    const ev = buildEvent(group);
    ev.totalRecords = activeRecords.size;
    events.push(ev);
  }

  // Reverse back to DESC order for display
  events.reverse();
  return events;
}

function buildEvent(entries: HistoryEntry[]): HistoryEvent {
  const counts: Record<string, number> = {};
  for (const e of entries) {
    counts[e.action] = (counts[e.action] || 0) + 1;
  }

  const parts: string[] = [];
  if (counts.insert) parts.push(`${counts.insert}건 추가`);
  if (counts.update) parts.push(`${counts.update}건 수정`);
  if (counts.delete) parts.push(`${counts.delete}건 삭제`);
  if (counts.restore) parts.push(`${counts.restore}건 복원`);

  return {
    timestamp: entries[0].created_at,
    lastTimestamp: entries[entries.length - 1].created_at,
    entries,
    summary: parts.join(', ') || '변경 없음',
  };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}

export default function HistoryPanel({ projectId, onRestore, onClose }: Props) {
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('record_history')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) {
        console.error('HistoryPanel fetch:', error);
        setLoading(false);
        return;
      }

      setEvents(groupIntoEvents(data ?? []));
      setLoading(false);
    })();
  }, [projectId]);

  const handleRestore = useCallback(async (event: HistoryEvent) => {
    if (!confirm('이 시점의 상태로 복원하시겠습니까?\n현재 데이터가 이 시점의 데이터로 교체됩니다.')) return;

    setRestoring(true);
    try {
      // Use the last timestamp of the group to include all entries in this event
      const endTime = event.lastTimestamp;

      // Strategy: get all history entries up to and including this event,
      // then reconstruct each record's latest state
      const { data: allHistory, error } = await supabase
        .from('record_history')
        .select('*')
        .eq('project_id', projectId)
        .lte('created_at', endTime)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Restore fetch:', error);
        alert('복원 중 오류가 발생했습니다.');
        return;
      }

      // Build record state map: for each record_id, track its latest state
      const recordStates = new Map<number, { data: Record<string, unknown>; deleted: boolean }>();

      for (const entry of allHistory ?? []) {
        if (entry.action === 'delete') {
          recordStates.set(entry.record_id, { data: entry.old_data, deleted: true });
        } else if (entry.action === 'insert' || entry.action === 'update' || entry.action === 'restore') {
          recordStates.set(entry.record_id, { data: entry.new_data, deleted: false });
        }
      }

      // Convert to TreeRecord array (only non-deleted)
      const restored: TreeRecord[] = [];
      for (const [, state] of recordStates) {
        if (state.deleted || !state.data) continue;
        const d = state.data;
        restored.push({
          id: d.id as number,
          diameter: Number(d.diameter) || 0,
          species: (d.species as TreeRecord['species']) || '',
          location: (d.location as string) || '',
        });
      }

      // Sort by sort_order if available
      restored.sort((a, b) => {
        const aOrder = (recordStates.get(a.id)?.data as Record<string, unknown>)?.sort_order as number ?? 0;
        const bOrder = (recordStates.get(b.id)?.data as Record<string, unknown>)?.sort_order as number ?? 0;
        return aOrder - bOrder;
      });

      onRestore(restored);
      onClose();
    } finally {
      setRestoring(false);
    }
  }, [projectId, onRestore, onClose]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-lg bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl
        max-h-[85vh] flex flex-col shadow-xl border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">변경 이력</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full cursor-pointer
              text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 text-lg"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading && (
            <p className="text-gray-400 dark:text-gray-500 text-center py-8">로딩 중...</p>
          )}

          {!loading && events.length === 0 && (
            <p className="text-gray-400 dark:text-gray-500 text-center py-8">변경 이력이 없습니다.</p>
          )}

          {!loading && events.map((event, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0"
            >
              {/* Timeline dot */}
              <div className="mt-1.5 w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />

              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {event.summary}
                </div>
                {event.totalRecords != null && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    총 {event.totalRecords}건
                  </div>
                )}
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {formatTime(event.timestamp)}
                </div>
              </div>

              <button
                onClick={() => handleRestore(event)}
                disabled={restoring}
                className="text-xs px-2.5 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400
                  rounded-lg cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/50
                  disabled:opacity-50 shrink-0 font-medium"
              >
                복원
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
