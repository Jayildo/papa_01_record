import type { TreeRecord, SyncStatus } from '../types';
import { supabase } from '../lib/supabase';
import { backupRecords, queueOfflineChange, removeFromQueue } from './offlineStore';

let syncInProgress = false;

interface SyncResult {
  status: SyncStatus;
  updatedRecords?: TreeRecord[];
  error?: string;
}

export async function syncRecords(
  localRecords: TreeRecord[],
  projectId: string,
): Promise<SyncResult> {
  // 1. Always backup to localStorage first
  backupRecords(projectId, localRecords);

  // 2. Prevent concurrent sync
  if (syncInProgress) {
    return { status: 'syncing' };
  }

  // 3. Check online status
  if (!navigator.onLine) {
    queueOfflineChange(projectId, localRecords);
    return { status: 'offline' };
  }

  syncInProgress = true;

  try {
    // 4. Fetch server records (active only)
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

    // 5. Empty array guard — prevent accidental data wipe
    if (localRecords.length === 0 && serverRecords.length > 0) {
      console.warn('syncEngine: blocked empty-array sync (server has', serverRecords.length, 'records)');
      return { status: 'synced' };
    }

    // 6. Build server map by id
    const serverMap = new Map<number, (typeof serverRows)[0]>();
    for (const row of serverRecords) {
      serverMap.set(row.id, row);
    }

    // 7. Separate new vs existing records
    const toInsert: Array<{
      project_id: string;
      diameter: number;
      species: string;
      location: string;
      sort_order: number;
    }> = [];
    const toUpsert: Array<{
      id: number;
      project_id: string;
      diameter: number;
      species: string;
      location: string;
      sort_order: number;
    }> = [];
    const localIds = new Set<number>();

    localRecords.forEach((r, i) => {
      if (r._isNew || !serverMap.has(r.id)) {
        // New record — INSERT without id
        toInsert.push({
          project_id: projectId,
          diameter: r.diameter,
          species: r.species,
          location: r.location,
          sort_order: i,
        });
      } else {
        // Existing record — UPDATE
        localIds.add(r.id);
        toUpsert.push({
          id: r.id,
          project_id: projectId,
          diameter: r.diameter,
          species: r.species,
          location: r.location,
          sort_order: i,
        });
      }
    });

    // 8. Soft delete: records on server but not in local
    const toSoftDelete: number[] = [];
    for (const [serverId] of serverMap) {
      if (!localIds.has(serverId)) {
        toSoftDelete.push(serverId);
      }
    }

    // 9. Execute operations
    const errors: string[] = [];

    // Upsert existing records
    if (toUpsert.length > 0) {
      const { error } = await supabase
        .from('tree_records')
        .upsert(toUpsert, { onConflict: 'id' });
      if (error) {
        console.error('syncEngine upsert:', error);
        errors.push(error.message);
      }
    }

    // Insert new records
    let insertedRows: Array<{ id: number }> = [];
    if (toInsert.length > 0) {
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

    // Soft delete removed records
    if (toSoftDelete.length > 0) {
      const { error } = await supabase
        .from('tree_records')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', toSoftDelete);
      if (error) {
        console.error('syncEngine softDelete:', error);
        errors.push(error.message);
      }
    }

    // 10. Build updated records with real DB ids
    let insertIdx = 0;
    const updatedRecords = localRecords.map((r) => {
      if (r._isNew || !serverMap.has(r.id)) {
        const newId = insertedRows[insertIdx]?.id ?? r.id;
        insertIdx++;
        return { ...r, id: newId, _isNew: undefined };
      }
      return { ...r, _isNew: undefined };
    });

    // 11. Clear offline queue on success
    if (errors.length === 0) {
      removeFromQueue(projectId);
    }

    return {
      status: errors.length > 0 ? 'error' : 'synced',
      updatedRecords,
      error: errors.length > 0 ? errors.join('; ') : undefined,
    };
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
