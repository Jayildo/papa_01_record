import type { TreeRecord, SyncStatus } from '../types';
import { supabase } from '../lib/supabase';
import { backupRecords, queueOfflineChange, removeFromQueue } from './offlineStore';

let syncInProgress = false;

export interface PendingChanges {
  updates: Map<number, TreeRecord>;  // 수정된 레코드
  inserts: TreeRecord[];              // 새 레코드
  deletes: number[];                  // soft delete할 ID
  /** sort_order 동기화를 위한 전체 레코드 (updates/inserts 외 기존 레코드 포함) */
  allRecords: TreeRecord[];
}

interface SyncResult {
  status: SyncStatus;
  idMappings?: Array<{ tempId: number; realId: number }>;
  error?: string;
}

/**
 * 변경 기반 sync — 변경된 레코드만 전송
 * full diff 대신 pendingChanges로 전달받은 변경분만 처리
 */
export async function syncChanges(
  changes: PendingChanges,
  projectId: string,
): Promise<SyncResult> {
  // 1. Always backup full state to localStorage
  backupRecords(projectId, changes.allRecords);

  // 2. Prevent concurrent sync
  if (syncInProgress) {
    return { status: 'syncing' };
  }

  // 3. Check online status
  if (!navigator.onLine) {
    queueOfflineChange(projectId, changes.allRecords);
    return { status: 'offline' };
  }

  // 4. Nothing to sync
  if (changes.updates.size === 0 && changes.inserts.length === 0 && changes.deletes.length === 0) {
    return { status: 'synced' };
  }

  syncInProgress = true;

  try {
    const errors: string[] = [];

    // 5. Batch UPDATE via RPC (1 API call for all updates)
    if (changes.updates.size > 0) {
      const updatePayload = Array.from(changes.updates.entries()).map(([, r], idx) => {
        // sort_order는 allRecords에서의 위치로 계산
        const sortOrder = changes.allRecords.findIndex((ar) => ar.id === r.id);
        return {
          id: r.id,
          diameter: r.diameter,
          species: r.species,
          location: r.location,
          note: r.note ?? '',
          sort_order: sortOrder >= 0 ? sortOrder : idx,
        };
      });

      const { error } = await supabase.rpc('batch_update_records', {
        p_project_id: projectId,
        p_records: updatePayload,
      });

      if (error) {
        console.error('syncEngine batch update:', error);
        // RPC 실패 시 개별 UPDATE로 폴백
        const fallbackPromises = updatePayload.map((rec) =>
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
                console.error('syncEngine fallback update id=' + rec.id + ':', e);
                errors.push(e.message);
              }
            }),
        );
        await Promise.all(fallbackPromises);
      }
    }

    // 6. INSERT new records (1 API call)
    let insertedRows: Array<{ id: number }> = [];
    if (changes.inserts.length > 0) {
      const toInsert = changes.inserts.map((r) => {
        const sortOrder = changes.allRecords.findIndex((ar) => ar.id === r.id);
        return {
          project_id: projectId,
          diameter: r.diameter,
          species: r.species,
          location: r.location,
          note: r.note ?? '',
          sort_order: sortOrder >= 0 ? sortOrder : 0,
        };
      });

      const { data, error } = await supabase
        .from('tree_records')
        .insert(toInsert)
        .select('id');
      if (error) {
        console.error('syncEngine insert:', error);
        errors.push(error.message);
      }
      insertedRows = data ?? [];
    }

    // 7. Soft DELETE (1 API call)
    if (changes.deletes.length > 0) {
      const { error } = await supabase
        .from('tree_records')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', changes.deletes);
      if (error) {
        console.error('syncEngine softDelete:', error);
        errors.push(error.message);
      }
    }

    // 8. Build ID mappings for newly inserted records
    const idMappings: Array<{ tempId: number; realId: number }> = [];
    changes.inserts.forEach((r, i) => {
      const realId = insertedRows[i]?.id;
      if (realId != null && realId !== r.id) {
        idMappings.push({ tempId: r.id, realId });
      }
    });

    // 9. Update sort_order for ALL records (after inserts/deletes may have changed positions)
    if (changes.allRecords.length > 0) {
      const tempToReal = new Map(idMappings.map(m => [m.tempId, m.realId]));
      const sortPayload: Array<{ id: number; sort_order: number }> = [];

      for (let i = 0; i < changes.allRecords.length; i++) {
        const r = changes.allRecords[i];
        const realId = tempToReal.get(r.id);
        if (realId != null) {
          // 새로 INSERT된 레코드 (tempId → realId)
          sortPayload.push({ id: realId, sort_order: i });
        } else if (!r._isNew) {
          // 기존 레코드
          sortPayload.push({ id: r.id, sort_order: i });
        }
      }

      if (sortPayload.length > 0) {
        const { error } = await supabase.rpc('batch_update_sort_order', {
          p_project_id: projectId,
          p_records: sortPayload,
        });
        if (error) {
          console.error('syncEngine sort_order update:', error);
          // Non-fatal: sort_order is cosmetic, don't fail the whole sync
        }
      }
    }

    // 10. Clear offline queue on success
    if (errors.length === 0) {
      removeFromQueue(projectId);
    }

    return {
      status: errors.length > 0 ? 'error' : 'synced',
      idMappings: idMappings.length > 0 ? idMappings : undefined,
      error: errors.length > 0 ? errors.join('; ') : undefined,
    };
  } catch (err) {
    console.error('syncEngine unexpected:', err);
    queueOfflineChange(projectId, changes.allRecords);
    return { status: 'error', error: String(err) };
  } finally {
    syncInProgress = false;
  }
}

/**
 * Legacy full-sync — offline queue flush 및 초기 동기화용으로 유지
 */
export async function syncRecords(
  localRecords: TreeRecord[],
  projectId: string,
): Promise<SyncResult> {
  backupRecords(projectId, localRecords);

  if (syncInProgress) return { status: 'syncing' };
  if (!navigator.onLine) {
    queueOfflineChange(projectId, localRecords);
    return { status: 'offline' };
  }

  syncInProgress = true;

  try {
    const { data: serverRows, error: fetchError } = await supabase
      .from('tree_records')
      .select('*')
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true });

    if (fetchError) {
      console.error('syncEngine fetch:', fetchError);
      queueOfflineChange(projectId, localRecords);
      return { status: 'error', error: fetchError.message };
    }

    const serverRecords = serverRows ?? [];

    if (localRecords.length === 0 && serverRecords.length > 0) {
      console.warn('syncEngine: blocked empty-array sync (server has', serverRecords.length, 'records)');
      return { status: 'synced' };
    }

    const serverMap = new Map<number, (typeof serverRows)[0]>();
    for (const row of serverRecords) serverMap.set(row.id, row);

    // Build changes from full diff
    const updates = new Map<number, TreeRecord>();
    const inserts: TreeRecord[] = [];
    const deletes: number[] = [];

    localRecords.forEach((r) => {
      if (r._isNew || !serverMap.has(r.id)) {
        inserts.push(r);
      } else {
        updates.set(r.id, r);
      }
    });

    const localIds = new Set(localRecords.filter((r) => !r._isNew).map((r) => r.id));
    for (const [serverId] of serverMap) {
      if (!localIds.has(serverId)) deletes.push(serverId);
    }

    // Delegate to syncChanges (reuse logic)
    syncInProgress = false; // release lock for syncChanges
    return await syncChanges(
      { updates, inserts, deletes, allRecords: localRecords },
      projectId,
    );
  } catch (err) {
    console.error('syncEngine unexpected:', err);
    queueOfflineChange(projectId, localRecords);
    return { status: 'error', error: String(err) };
  } finally {
    syncInProgress = false;
  }
}

/** Flush offline queue — call when coming back online */
export async function flushOfflineQueue(
  getRecords: (projectId: string) => TreeRecord[] | undefined,
): Promise<void> {
  const { getOfflineQueue } = await import('./offlineStore');
  const queue = getOfflineQueue();
  for (const entry of queue) {
    const current = getRecords(entry.projectId);
    if (current) {
      await syncRecords(current, entry.projectId);
    }
  }
}
