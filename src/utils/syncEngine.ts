import type { TreeRecord, SyncStatus } from '../types';
import { supabase } from '../lib/supabase';
import { backupRecords, queueOfflineChange, removeFromQueue } from './offlineStore';

let syncInProgress = false;

export interface SyncResult {
  status: SyncStatus;
  syncedIds: number[];
  idMappings: Map<number, number>;
  error?: string;
}

/** 레코드의 데이터 내용을 해시 문자열로 변환 (sync 중 변경 감지용) */
export function hashRecord(r: TreeRecord): string {
  return `${r.diameter}|${r.species}|${r.location}|${r.note ?? ''}`;
}

/**
 * _syncState === 'pending'인 레코드만 동기화
 * - id < 0 → INSERT (새 레코드)
 * - id > 0 → UPDATE (수정된 레코드)
 * - deletedIds → soft DELETE
 */
export async function syncPendingRecords(
  allRecords: TreeRecord[],
  projectId: string,
  deletedIds: number[] = [],
): Promise<SyncResult> {
  // 1. 전체 레코드 백업
  backupRecords(projectId, allRecords);

  // 2. 동시 sync 방지
  if (syncInProgress) {
    return { status: 'syncing', syncedIds: [], idMappings: new Map() };
  }

  // 3. 오프라인 체크
  if (!navigator.onLine) {
    queueOfflineChange(projectId, allRecords);
    return { status: 'offline', syncedIds: [], idMappings: new Map() };
  }

  const pendingRecords = allRecords.filter(r => r._syncState === 'pending');
  // 안전장치: diameter <= 0인 레코드는 절대 sync하지 않음
  const toInsert = pendingRecords.filter(r => r.id < 0 && r.diameter > 0);
  const toUpdate = pendingRecords.filter(r => r.id > 0 && r.diameter > 0);

  // 4. 할 일 없으면 종료
  if (toInsert.length === 0 && toUpdate.length === 0 && deletedIds.length === 0) {
    return { status: 'synced', syncedIds: [], idMappings: new Map() };
  }

  syncInProgress = true;

  try {
    const errors: string[] = [];
    const syncedIds: number[] = [];
    const idMappings = new Map<number, number>();

    // 5. Batch UPDATE (기존 레코드 수정)
    if (toUpdate.length > 0) {
      const updatePayload = toUpdate.map(r => {
        const sortOrder = allRecords.findIndex(ar => ar.id === r.id);
        return {
          id: r.id,
          diameter: r.diameter,
          species: r.species,
          location: r.location,
          note: r.note ?? '',
          sort_order: sortOrder >= 0 ? sortOrder : 0,
        };
      });

      const { error } = await supabase.rpc('batch_update_records', {
        p_project_id: projectId,
        p_records: updatePayload,
      });

      if (error) {
        console.error('syncEngine batch update:', error);
        // RPC 실패 시 개별 UPDATE 폴백
        const fallbackPromises = updatePayload.map(rec =>
          supabase
            .from('tree_records')
            .update({
              diameter: rec.diameter,
              species: rec.species,
              location: rec.location,
              note: rec.note,
              sort_order: rec.sort_order,
            })
            .eq('id', rec.id)
            .then(({ error: e }) => {
              if (e) {
                errors.push(`수정 실패 (id=${rec.id}): ${e.message}`);
              } else {
                syncedIds.push(rec.id);
              }
            }),
        );
        await Promise.all(fallbackPromises);
      } else {
        syncedIds.push(...toUpdate.map(r => r.id));
      }
    }

    // 6. INSERT (새 레코드, 100건씩 분할)
    if (toInsert.length > 0) {
      const insertPayload = toInsert.map(r => {
        const sortOrder = allRecords.findIndex(ar => ar.id === r.id);
        return {
          project_id: projectId,
          diameter: r.diameter,
          species: r.species,
          location: r.location,
          note: r.note ?? '',
          sort_order: sortOrder >= 0 ? sortOrder : 0,
        };
      });

      const CHUNK_SIZE = 100;
      let insertedRows: Array<{ id: number }> = [];

      for (let i = 0; i < insertPayload.length; i += CHUNK_SIZE) {
        const chunk = insertPayload.slice(i, i + CHUNK_SIZE);
        const { data, error } = await supabase
          .from('tree_records')
          .insert(chunk)
          .select('id');
        if (error) {
          console.error(`syncEngine insert chunk ${i / CHUNK_SIZE + 1}:`, error);
          errors.push(`추가 실패 (${i + 1}~${i + chunk.length}건): ${error.message}`);
        }
        if (data) {
          insertedRows.push(...data);
        }
      }

      // ID 매핑 빌드
      toInsert.forEach((r, i) => {
        const realId = insertedRows[i]?.id;
        if (realId != null) {
          idMappings.set(r.id, realId);
          syncedIds.push(r.id); // temp ID로 추적
        }
      });
    }

    // 7. Soft DELETE
    if (deletedIds.length > 0) {
      const { error } = await supabase
        .from('tree_records')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', deletedIds);
      if (error) {
        console.error('syncEngine softDelete:', error);
        errors.push('삭제 실패: ' + error.message);
      }
    }

    // 8. sort_order 업데이트 (non-draft 레코드 전체)
    const sortPayload: Array<{ id: number; sort_order: number }> = [];
    for (let i = 0; i < allRecords.length; i++) {
      const r = allRecords[i];
      if (r._syncState === 'draft') continue;
      const realId = idMappings.get(r.id) ?? r.id;
      if (realId > 0) {
        sortPayload.push({ id: realId, sort_order: i });
      }
    }

    if (sortPayload.length > 0) {
      const { error } = await supabase.rpc('batch_update_sort_order', {
        p_project_id: projectId,
        p_records: sortPayload,
      });
      if (error) {
        console.error('syncEngine sort_order update:', error);
        // Non-fatal
      }
    }

    // 9. 성공 시 오프라인 큐 정리
    if (errors.length === 0) {
      removeFromQueue(projectId);
    }

    return {
      status: errors.length > 0 ? 'error' : 'synced',
      syncedIds,
      idMappings,
      error: errors.length > 0 ? errors.join('; ') : undefined,
    };
  } catch (err) {
    console.error('syncEngine unexpected:', err);
    queueOfflineChange(projectId, allRecords);
    return { status: 'error', syncedIds: [], idMappings: new Map(), error: String(err) };
  } finally {
    syncInProgress = false;
  }
}

/** Flush offline queue — call when coming back online */
export async function flushOfflineQueue(): Promise<void> {
  const { getOfflineQueue } = await import('./offlineStore');
  const queue = getOfflineQueue();
  for (const entry of queue) {
    if (entry.records && entry.records.length > 0) {
      // 오프라인 큐의 레코드를 pending으로 처리
      const records = entry.records.map(r => ({
        ...r,
        _syncState: r._syncState ?? ('pending' as const),
      }));
      const result = await syncPendingRecords(records, entry.projectId);
      if (result.status === 'offline') break;
    }
  }
}
