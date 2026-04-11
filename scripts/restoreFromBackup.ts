// 특정 레코드 단일 복원 스크립트 (dry-run 기본)
// Usage:
//   npx tsx scripts/restoreFromBackup.ts <backup-dir> --table <name> --id <uuid> [--commit]
//
// 기본 dry-run: 현재 DB 행과 백업 행을 diff하여 변경 필드만 출력
// --commit: 백업 값으로 현재 행을 UPDATE (sealed 경고 포함)

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.resolve(PROJECT_ROOT, '.env');
const BACKUP_ROOT = path.resolve(PROJECT_ROOT, 'backups');

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

function parseArgs() {
  const args = process.argv.slice(2);
  let backupDir = '';
  let table = '';
  let id = '';
  let commit = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--table') { table = args[++i] ?? ''; }
    else if (a === '--id') { id = args[++i] ?? ''; }
    else if (a === '--commit') { commit = true; }
    else if (!a.startsWith('--') && !backupDir) { backupDir = a; }
  }
  return { backupDir, table, id, commit };
}

function findLatestBackupDir(): string {
  if (!fs.existsSync(BACKUP_ROOT)) throw new Error('backups/ 폴더가 없습니다.');
  const dirs = fs
    .readdirSync(BACKUP_ROOT)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  if (dirs.length === 0) throw new Error('백업이 없습니다. npm run backup 을 먼저 실행하세요.');
  return path.join(BACKUP_ROOT, dirs[dirs.length - 1]);
}

function escapeSql(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  // escape single quotes
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function main() {
  const { backupDir: rawDir, table, id, commit } = parseArgs();

  if (!table || !id) {
    console.error('사용법: npx tsx scripts/restoreFromBackup.ts [backup-dir] --table <name> --id <uuid> [--commit]');
    console.error('예: npx tsx scripts/restoreFromBackup.ts --table work_logs --id abc-123 --commit');
    process.exit(1);
  }

  const backupDir = rawDir
    ? path.resolve(PROJECT_ROOT, rawDir)
    : findLatestBackupDir();

  const jsonPath = path.join(backupDir, `${table}.json`);
  if (!fs.existsSync(jsonPath)) {
    console.error(`백업 파일 없음: ${jsonPath}`);
    process.exit(1);
  }

  const rows = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as Record<string, unknown>[];
  const backupRow = rows.find((r) => r['id'] === id);
  if (!backupRow) {
    console.error(`백업에서 id=${id} 를 찾을 수 없습니다.`);
    process.exit(1);
  }

  // 현재 DB 행 조회
  const currentRows = await runQuery<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE id = '${id.replace(/'/g, "''")}'`
  );
  const currentRow = currentRows[0] ?? null;

  console.log(`\n백업: ${backupDir}`);
  console.log(`테이블: ${table}, id: ${id}\n`);

  // sealed 경고
  if (
    (backupRow['sealed'] === true || (currentRow && currentRow['sealed'] === true)) &&
    commit
  ) {
    console.warn('⚠ 경고: 이 레코드는 sealed(확정) 상태입니다. 복원 전에 DB에서 sealed=false 로 변경해주세요.');
    console.warn('  (restore를 진행하면 DB 트리거가 차단할 수 있습니다.)');
  }

  if (!currentRow) {
    console.log('현재 DB에 해당 행이 없습니다. (삭제된 상태)');
    console.log('백업 행:');
    console.log(JSON.stringify(backupRow, null, 2));
  } else {
    // diff 출력
    const allKeys = new Set([...Object.keys(backupRow), ...Object.keys(currentRow)]);
    const diffs: { field: string; backup: unknown; current: unknown }[] = [];
    for (const key of allKeys) {
      const bv = JSON.stringify(backupRow[key] ?? null);
      const cv = JSON.stringify(currentRow[key] ?? null);
      if (bv !== cv) diffs.push({ field: key, backup: backupRow[key], current: currentRow[key] });
    }

    if (diffs.length === 0) {
      console.log('현재 DB와 백업이 동일합니다. 복원 불필요.');
      return;
    }

    console.log(`변경된 필드 ${diffs.length}개:`);
    for (const d of diffs) {
      console.log(`  ${d.field.padEnd(25)} 백업: ${JSON.stringify(d.backup)}  →  현재: ${JSON.stringify(d.current)}`);
    }
  }

  if (!commit) {
    console.log('\n[dry-run] 실제 복원하려면 --commit 플래그를 추가하세요.');
    return;
  }

  // --commit: UPDATE SET ...
  const setCols = Object.entries(backupRow)
    .filter(([k]) => k !== 'id')
    .map(([k, v]) => `${k} = ${escapeSql(v)}`)
    .join(', ');

  const updateSql = `UPDATE ${table} SET ${setCols} WHERE id = ${escapeSql(id)}`;

  console.log('\n복원 SQL 실행 중...');
  await runQuery(updateSql);
  console.log('✓ 복원 완료');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
