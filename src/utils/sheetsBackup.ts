import type { TreeRecord } from '../types';

const SHEETS_URL = import.meta.env.VITE_GOOGLE_SHEETS_WEBHOOK_URL as string | undefined;

/**
 * Google Sheets에 레코드 백업 (Google Apps Script 웹훅 방식)
 * - Supabase 동기화 성공 후 호출
 * - 실패해도 throw하지 않음 (비필수 백업)
 * - VITE_GOOGLE_SHEETS_WEBHOOK_URL 미설정 시 자동 비활성화
 */
export async function backupToGoogleSheets(
  records: TreeRecord[],
  projectName: string,
): Promise<void> {
  if (!SHEETS_URL) return;

  try {
    const response = await fetch(SHEETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectName,
        records: records.map((r, idx) => ({
          index: idx + 1,
          diameter: r.diameter,
          species: r.species,
          location: r.location,
          note: r.note ?? '',
          timestamp: new Date().toISOString(),
        })),
      }),
    });

    if (!response.ok) {
      console.warn('Google Sheets backup: HTTP', response.status);
    }
  } catch (err) {
    console.warn('Google Sheets backup failed (non-critical):', err);
  }
}
