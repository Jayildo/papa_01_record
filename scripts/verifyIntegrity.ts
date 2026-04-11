// 백업 vs 현재 DB 무결성 검증 스크립트
// 최신 백업 폴더를 자동 탐색하여 sha256 해시를 비교합니다.
// Run: npx tsx scripts/verifyIntegrity.ts [backup-dir]

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import * as crypto from 'node:crypto';

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

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function canonicalStringify(rows: unknown[]): string {
  return JSON.stringify(rows, Object.keys(rows[0] ?? {}).sort());
}

// 최신 백업 폴더 자동 탐색
function findLatestBackupDir(explicitDir?: string): string {
  if (explicitDir) {
    const abs = path.resolve(PROJECT_ROOT, explicitDir);
    if (!fs.existsSync(abs)) throw new Error(`백업 폴더를 찾을 수 없습니다: ${abs}`);
    return abs;
  }
  if (!fs.existsSync(BACKUP_ROOT)) throw new Error(`backups/ 폴더가 없습니다.`);
  const dirs = fs
    .readdirSync(BACKUP_ROOT)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  if (dirs.length === 0) throw new Error('백업 폴더가 없습니다. npm run backup 을 먼저 실행하세요.');
  return path.join(BACKUP_ROOT, dirs[dirs.length - 1]);
}

async function main() {
  const explicitDir = process.argv[2];
  const backupDir = findLatestBackupDir(explicitDir);
  const metaPath = path.join(backupDir, 'meta.json');
  if (!fs.existsSync(metaPath)) throw new Error(`meta.json 없음: ${metaPath}`);

  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as {
    timestamp: string;
    tables: { name: string; count: number; sha256: string }[];
  };

  console.log(`백업: ${backupDir}`);
  console.log(`백업 시각: ${meta.timestamp}\n`);
  console.log(`${'테이블'.padEnd(28)} ${'백업행수'.padStart(7)}  ${'현재행수'.padStart(7)}  결과`);
  console.log('─'.repeat(65));

  let driftCount = 0;
  for (const tableEntry of meta.tables) {
    const { name, count: backupCount, sha256: backupHash } = tableEntry;
    if (backupHash === '') {
      console.log(`  ${name.padEnd(26)} ${'오류'.padStart(7)}  ${'?'.padStart(7)}  ⚠ 백업 실패`);
      continue;
    }

    process.stdout.write(`  ${name.padEnd(26)} ${String(backupCount).padStart(7)}  `);

    let currentCount = 0;
    let currentHash = '';
    try {
      const rows = await runQuery(`SELECT * FROM ${name} ORDER BY 1`);
      currentCount = rows.length;
      currentHash = sha256(canonicalStringify(rows));
    } catch (err) {
      console.log(`${'오류'.padStart(7)}  DB 조회 실패: ${(err as Error).message}`);
      driftCount++;
      continue;
    }

    const match = backupHash === currentHash;
    if (match) {
      console.log(`${String(currentCount).padStart(7)}  ✓ 일치`);
    } else {
      const rowDiff = currentCount - backupCount;
      const sign = rowDiff >= 0 ? '+' : '';
      console.log(`${String(currentCount).padStart(7)}  ✗ 불일치 (행 차이: ${sign}${rowDiff})`);
      driftCount++;
    }
  }

  console.log('─'.repeat(65));
  if (driftCount === 0) {
    console.log('\n모든 테이블 해시 일치 ✓');
  } else {
    console.log(`\n⚠ ${driftCount}개 테이블에서 드리프트 감지됨. 백업 이후 변경사항이 있거나 데이터가 변경되었습니다.`);
    console.log('  - 정상 변경이면 npm run backup 으로 새 베이스라인 생성');
    console.log('  - 예상치 못한 변경이면 scripts/restoreFromBackup.ts 로 복원 검토');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
