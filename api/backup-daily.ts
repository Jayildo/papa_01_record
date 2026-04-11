// Vercel Serverless Function — 일일 자동 백업
// 매일 03:00 KST (UTC 18:00) 에 Vercel Cron이 호출합니다.
// 전 테이블 SELECT → JSON → gzip → Vercel Blob 저장, 90일 초과 파일 pruning

import { gzipSync } from 'node:zlib';
import { put, list, del } from '@vercel/blob';

// Minimal inline types for Vercel Node.js Serverless Functions
// (avoids requiring @vercel/node as a dependency)
interface VercelRequest {
  headers: Record<string, string | string[] | undefined>;
}
interface VercelResponse {
  status(code: number): VercelResponse;
  json(data: unknown): void;
}

const TABLES = [
  'projects',
  'tree_records',
  'record_history',
  'labor_projects',
  'labor_entries',
  'labor_workers',
  'labor_worker_pool',
  'labor_companies',
  'labor_project_history',
  'work_logs',
  'work_log_laborers',
  'work_log_items',
] as const;

const RETENTION_DAYS = 90;

async function runQuery<T = unknown>(
  projectRef: string,
  token: string,
  query: string,
): Promise<T[]> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Query failed (${res.status}): ${text}`);
  return JSON.parse(text) as T[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return await handlerInner(req, res);
  } catch (err) {
    console.error('backup-daily crashed:', err);
    res.status(500).json({
      error: 'backup-daily crashed',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.split('\n').slice(0, 5) : undefined,
      env: {
        hasCronSecret: !!process.env['CRON_SECRET'],
        hasSupabaseToken: !!process.env['SUPABASE_ACCESS_TOKEN'],
        hasSupabaseUrl: !!process.env['VITE_SUPABASE_URL'],
        hasBlobToken: !!process.env['BLOB_READ_WRITE_TOKEN'],
      },
    });
  }
}

async function handlerInner(req: VercelRequest, res: VercelResponse) {
  // 인증: Vercel Cron은 Authorization: Bearer <CRON_SECRET> 헤더를 자동 첨부
  const cronSecret = process.env['CRON_SECRET'];
  if (cronSecret) {
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${cronSecret}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  const supabaseAccessToken = process.env['SUPABASE_ACCESS_TOKEN'];
  const supabaseUrl = process.env['VITE_SUPABASE_URL'];

  if (!supabaseAccessToken || !supabaseUrl) {
    res.status(500).json({ error: 'SUPABASE_ACCESS_TOKEN / VITE_SUPABASE_URL 환경변수 필요' });
    return;
  }

  const refMatch = supabaseUrl.match(/^https?:\/\/([^.]+)\.supabase\.co/);
  if (!refMatch) {
    res.status(500).json({ error: 'project ref 추출 실패' });
    return;
  }
  const projectRef = refMatch[1];

  const now = new Date();
  const stamp = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const blobPath = `backups/${stamp}.json.gz`;

  const result: Record<string, unknown[]> = {};
  const tableSummary: { name: string; count: number }[] = [];
  let totalRows = 0;

  for (const table of TABLES) {
    try {
      const rows = await runQuery<unknown>(projectRef, supabaseAccessToken, `SELECT * FROM ${table} ORDER BY 1`);
      result[table] = rows;
      tableSummary.push({ name: table, count: rows.length });
      totalRows += rows.length;
    } catch (err) {
      tableSummary.push({ name: table, count: -1 });
      console.error(`backup-daily: ${table} 조회 실패:`, err);
    }
  }

  const payload = JSON.stringify({
    timestamp: now.toISOString(),
    projectRef,
    tables: tableSummary,
    totalRows,
    data: result,
  });

  const compressed = gzipSync(Buffer.from(payload, 'utf-8'));

  await put(blobPath, compressed, {
    access: 'public',
    contentType: 'application/gzip',
    addRandomSuffix: false,
  });

  // 90일 초과 파일 pruning
  try {
    const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);

    const { blobs } = await list({ prefix: 'backups/' });
    const toDelete = blobs
      .filter((b) => {
        const m = b.pathname.match(/backups\/(\d{4}-\d{2}-\d{2})\.json\.gz$/);
        return m && m[1] < cutoffDate;
      })
      .map((b) => b.url);

    if (toDelete.length > 0) {
      await del(toDelete);
      console.log(`backup-daily: ${toDelete.length}개 오래된 백업 삭제`);
    }
  } catch (pruneErr) {
    console.error('backup-daily: pruning 실패 (무시):', pruneErr);
  }

  res.status(200).json({
    ok: true,
    stamp,
    totalRows,
    tables: tableSummary,
  });
}
