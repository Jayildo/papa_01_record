#!/usr/bin/env node
/**
 * Supabase → 로컬 JSON 백업 스크립트
 * 매일 crontab으로 실행, 30일치 보관
 *
 * 사용법:
 *   node scripts/backup.mjs
 *
 * 환경변수 (.env.backup 파일 또는 쉘 환경변수):
 *   SUPABASE_URL       (필수)
 *   SUPABASE_ANON_KEY  (필수)
 *   BACKUP_DIR         (선택, 기본: ./backups)
 *   RETENTION_DAYS     (선택, 기본: 30)
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync, readFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// .env.backup 파일에서 환경변수 로드
function loadEnv() {
  const envPath = join(PROJECT_ROOT, '.env.backup');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.+?)\s*$/);
    if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

async function main() {
  loadEnv();

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL, SUPABASE_ANON_KEY 환경변수가 필요합니다.');
    console.error('.env.backup 파일을 만들거나 환경변수를 설정하세요.');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const backupDir = process.env.BACKUP_DIR || join(PROJECT_ROOT, 'backups');
  const retentionDays = parseInt(process.env.RETENTION_DAYS || '30', 10);

  // 오늘 날짜 폴더
  const today = new Date().toISOString().slice(0, 10);
  const todayDir = join(backupDir, today);
  mkdirSync(todayDir, { recursive: true });

  const tables = ['projects', 'tree_records', 'record_history'];
  const counts = {};

  for (const table of tables) {
    process.stdout.write(`  ${table} 백업 중...`);

    const allRows = [];
    const PAGE_SIZE = 1000;
    let offset = 0;

    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .range(offset, offset + PAGE_SIZE - 1)
        .order('id', { ascending: true });

      if (error) {
        console.error(` 실패: ${error.message}`);
        break;
      }
      if (!data || data.length === 0) break;

      allRows.push(...data);
      offset += PAGE_SIZE;
      if (data.length < PAGE_SIZE) break;
    }

    writeFileSync(join(todayDir, `${table}.json`), JSON.stringify(allRows, null, 2));
    counts[table] = allRows.length;
    console.log(` ${allRows.length}건`);
  }

  // 메타 정보
  const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);
  const meta = {
    timestamp: new Date().toISOString(),
    tables: Object.entries(counts).map(([name, count]) => ({ name, count })),
    totalRows,
  };
  writeFileSync(join(todayDir, 'meta.json'), JSON.stringify(meta, null, 2));

  console.log(`\n백업 완료: ${todayDir} (총 ${totalRows}행)`);

  // 오래된 백업 정리
  cleanup(backupDir, retentionDays);
}

function cleanup(backupDir, retentionDays) {
  if (!existsSync(backupDir)) return;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const dirs = readdirSync(backupDir).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
  let removed = 0;

  for (const dir of dirs) {
    if (dir < cutoffStr) {
      rmSync(join(backupDir, dir), { recursive: true, force: true });
      removed++;
    }
  }

  if (removed > 0) {
    console.log(`${removed}개 오래된 백업 삭제 (${retentionDays}일 이전)`);
  }
}

main().catch((err) => {
  console.error('백업 실패:', err);
  process.exit(1);
});
