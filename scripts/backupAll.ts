// 전 테이블 로컬 백업 스크립트 — Management API 로 전 테이블 SELECT + sha256 해시
// Run: npx tsx scripts/backupAll.ts
// Output: backups/YYYY-MM-DD/<table>.json + meta.json (해시 포함)
// Retention: 90일 초과 백업 자동 삭제

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import * as crypto from 'node:crypto';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.resolve(PROJECT_ROOT, '.env');
const BACKUP_ROOT = path.resolve(PROJECT_ROOT, 'backups');
const RETENTION_DAYS = 90;

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

function loadDotenv(p: string) {
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadDotenv(ENV_PATH);

const token = process.env['SUPABASE_ACCESS_TOKEN'];
const supabaseUrl = process.env['VITE_SUPABASE_URL'];
if (!token || !supabaseUrl) {
  console.error('SUPABASE_ACCESS_TOKEN / VITE_SUPABASE_URL 환경변수 필요');
  process.exit(1);
}
const refMatch = supabaseUrl.match(/^https?:\/\/([^.]+)\.supabase\.co/);
if (!refMatch) { console.error('project ref 추출 실패'); process.exit(1); }
const projectRef = refMatch[1];

async function runQuery<T = unknown>(query: string): Promise<T[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Query failed (${res.status}): ${text}`);
  return JSON.parse(text) as T[];
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function canonicalStringify(rows: unknown[]): string {
  return JSON.stringify(rows, Object.keys(rows[0] ?? {}).sort());
}

async function main() {
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dateDir = now.toISOString().slice(0, 10);
  const outDir = path.join(BACKUP_ROOT, dateDir);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`백업 대상: ${projectRef}`);
  console.log(`저장 경로: ${outDir}\n`);

  const tableMeta: { name: string; count: number; sha256: string; bytes: number }[] = [];
  let totalRows = 0;

  for (const table of TABLES) {
    process.stdout.write(`  ${table.padEnd(25)} `);
    try {
      const rows = await runQuery(`SELECT * FROM ${table} ORDER BY 1`);
      const json = JSON.stringify(rows, null, 2);
      const outPath = path.join(outDir, `${table}.json`);
      fs.writeFileSync(outPath, json);
      const hash = sha256(canonicalStringify(rows));
      tableMeta.push({ name: table, count: rows.length, sha256: hash, bytes: json.length });
      totalRows += rows.length;
      console.log(`${String(rows.length).padStart(6)}행  ${hash.slice(0, 16)}...`);
    } catch (err) {
      console.log(`실패: ${(err as Error).message}`);
      tableMeta.push({ name: table, count: -1, sha256: '', bytes: 0 });
    }
  }

  const meta = {
    timestamp: now.toISOString(),
    stamp,
    projectRef,
    tables: tableMeta,
    totalRows,
    retentionDays: RETENTION_DAYS,
  };
  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));

  console.log(`\n완료 — 총 ${totalRows}행, ${TABLES.length}개 테이블`);

  cleanup();
}

function cleanup() {
  if (!fs.existsSync(BACKUP_ROOT)) return;
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const dirs = fs
    .readdirSync(BACKUP_ROOT)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  let removed = 0;
  for (const d of dirs) {
    if (d < cutoff) {
      fs.rmSync(path.join(BACKUP_ROOT, d), { recursive: true, force: true });
      removed++;
    }
  }
  if (removed > 0) console.log(`${removed}개 오래된 백업 삭제 (cutoff: ${cutoff})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
