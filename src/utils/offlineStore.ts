import type { TreeRecord, Project } from '../types';

const BACKUP_PREFIX = 'papa_backup_';
const QUEUE_KEY = 'papa_offline_queue';

const IDB_NAME = 'papa_backup_db';
const IDB_STORE = 'records';
const IDB_PROJECTS_STORE = 'projects';
const IDB_VERSION = 2;

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
      if (!db.objectStoreNames.contains(IDB_PROJECTS_STORE)) {
        db.createObjectStore(IDB_PROJECTS_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbBackup(projectId: string, records: TreeRecord[]): Promise<void> {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(records, `backup_${projectId}`);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB not available — ignore
  }
}

export async function restoreFromIDB(projectId: string): Promise<TreeRecord[] | null> {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(`backup_${projectId}`);
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Save records to localStorage as backup (with IndexedDB double backup) */
export function backupRecords(projectId: string, records: TreeRecord[]): void {
  const key = `${BACKUP_PREFIX}${projectId}`;
  const json = JSON.stringify(records);
  try {
    localStorage.setItem(key, json);
  } catch {
    // localStorage full — clean old backups and retry
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(BACKUP_PREFIX) && k !== key) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(key, json);
    } catch {
      console.warn('localStorage backup failed even after cleanup for', projectId);
    }
  }
  // Double backup to IndexedDB (fire-and-forget)
  idbBackup(projectId, records);
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
  const queue = getOfflineQueue();
  const filtered = queue.filter((q) => q.projectId !== projectId);
  filtered.push({ projectId, records, timestamp: Date.now() });
  const json = JSON.stringify(filtered);
  try {
    localStorage.setItem(QUEUE_KEY, json);
  } catch {
    // Clean old backups and retry
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(BACKUP_PREFIX)) {
          localStorage.removeItem(k);
        }
      }
      localStorage.setItem(QUEUE_KEY, json);
    } catch {
      console.warn('localStorage queue failed even after cleanup');
    }
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

// ── 즉시 로컬 저장 (매 입력마다 호출) ──

/** 프로젝트 레코드를 IndexedDB에 즉시 저장 */
export async function persistRecordsImmediate(projectId: string, records: TreeRecord[]): Promise<void> {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(records, `live_${projectId}`);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // IndexedDB 실패 시 localStorage 폴백
    try {
      localStorage.setItem(`papa_live_${projectId}`, JSON.stringify(records));
    } catch {
      // 저장 불가 — 무시
    }
  }
}

/** IndexedDB에서 프로젝트 레코드 로드 */
export async function loadLocalRecords(projectId: string): Promise<TreeRecord[] | null> {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(`live_${projectId}`);
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    // IndexedDB 실패 시 localStorage 폴백
    try {
      const raw = localStorage.getItem(`papa_live_${projectId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

/** 프로젝트 목록을 IndexedDB에 저장 */
export async function persistProjectsImmediate(projects: Project[]): Promise<void> {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_PROJECTS_STORE, 'readwrite');
    tx.objectStore(IDB_PROJECTS_STORE).put(projects, 'all_projects');
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // 무시
  }
}

/** IndexedDB에서 프로젝트 목록 로드 */
export async function loadLocalProjects(): Promise<Project[] | null> {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_PROJECTS_STORE, 'readonly');
    const req = tx.objectStore(IDB_PROJECTS_STORE).get('all_projects');
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
