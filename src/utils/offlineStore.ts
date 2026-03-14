import type { TreeRecord } from '../types';

const BACKUP_PREFIX = 'papa_backup_';
const QUEUE_KEY = 'papa_offline_queue';

/** Save records to localStorage as backup */
export function backupRecords(projectId: string, records: TreeRecord[]): void {
  try {
    localStorage.setItem(`${BACKUP_PREFIX}${projectId}`, JSON.stringify(records));
  } catch {
    // localStorage full — silently fail
  }
}

/** Restore records from localStorage backup */
export function restoreBackup(projectId: string): TreeRecord[] | null {
  try {
    const raw = localStorage.getItem(`${BACKUP_PREFIX}${projectId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Clear backup for a project */
export function clearBackup(projectId: string): void {
  localStorage.removeItem(`${BACKUP_PREFIX}${projectId}`);
}

interface QueuedChange {
  projectId: string;
  records: TreeRecord[];
  timestamp: number;
}

/** Queue changes for later sync (when offline) */
export function queueOfflineChange(projectId: string, records: TreeRecord[]): void {
  try {
    const queue = getOfflineQueue();
    // Replace existing entry for same project
    const filtered = queue.filter((q) => q.projectId !== projectId);
    filtered.push({ projectId, records, timestamp: Date.now() });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
  } catch {
    // localStorage full
  }
}

/** Get all queued offline changes */
export function getOfflineQueue(): QueuedChange[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Remove a project's entry from the offline queue */
export function removeFromQueue(projectId: string): void {
  const queue = getOfflineQueue().filter((q) => q.projectId !== projectId);
  if (queue.length > 0) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } else {
    localStorage.removeItem(QUEUE_KEY);
  }
}
