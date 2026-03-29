export type RecordSyncState = 'draft' | 'pending' | 'synced';

export interface TreeRecord {
  id: number;
  diameter: number;
  species: '낙엽수' | '상록수' | '';
  location: string;
  note?: string;  // 비고
  updated_at?: string;
  _syncState: RecordSyncState;
}

export interface Project {
  id: string;
  name: string;
  records: TreeRecord[];
  createdAt: string;
  sealed?: boolean;  // 확정 상태 — true이면 수정 불가
}

export type DiameterRange = '~10' | '11~20' | '21~30' | '31~40' | '41~50' | '51~60' | '61~70' | '71~';

export const DIAMETER_RANGES: DiameterRange[] = ['~10', '11~20', '21~30', '31~40', '41~50', '51~60', '61~70', '71~'];
export const SPECIES_LIST: TreeRecord['species'][] = ['낙엽수', '상록수'];

export const DIAMETER_LABELS: Record<DiameterRange, string> = {
  '~10': '~B10',
  '11~20': 'B11~20',
  '21~30': 'B21~30',
  '31~40': 'B31~40',
  '41~50': 'B41~50',
  '51~60': 'B51~60',
  '61~70': 'B61~70',
  '71~': 'B71~',
};

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';
