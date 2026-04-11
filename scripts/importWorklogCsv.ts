// Run: npx tsx scripts/importWorklogCsv.ts [--commit]
// Reads 작업일지_20260411.csv from the project root, parses it, and prints a summary.
// Pass --commit to actually insert into Supabase (requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY env vars).

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const CSV_PATH = path.resolve(PROJECT_ROOT, '작업일지_20260411.csv');
const ENV_PATH = path.resolve(PROJECT_ROOT, '.env');
const COMMIT = process.argv.includes('--commit');

function loadDotenv(p: string) {
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, 'utf-8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadDotenv(ENV_PATH);

async function main() {
  const { parseWorklogCsv } = await import('../src/utils/worklogCsvParser.js');

  const text = fs.readFileSync(CSV_PATH, 'utf-8');
  const logs = parseWorklogCsv(text);

  console.log(`\n파싱 결과: ${logs.length}건`);
  for (const log of logs) {
    console.log(
      `  ${log.externalId ?? '?'} | ${log.workDate} | ${(log.location ?? '').slice(0, 40)} | 인력 ${log.laborers.length} | 항목 ${log.items.length}`,
    );
  }

  const totalLaborers = logs.reduce((s, l) => s + l.laborers.length, 0);
  const totalItems = logs.reduce((s, l) => s + l.items.length, 0);
  console.log(`\n합계: 인력 ${totalLaborers}행, 항목 ${totalItems}행`);

  if (!COMMIT) {
    console.log('\n[dry-run] --commit 플래그 없이 실행 중. DB에 쓰지 않습니다.');
    return;
  }

  const supabaseUrl = process.env['VITE_SUPABASE_URL'];
  const supabaseKey = process.env['VITE_SUPABASE_ANON_KEY'];
  if (!supabaseUrl || !supabaseKey) {
    console.error('VITE_SUPABASE_URL 또는 VITE_SUPABASE_ANON_KEY 환경변수가 없습니다.');
    process.exit(1);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseKey);

  let inserted = 0;
  let skipped = 0;

  for (const log of logs) {
    if (log.externalId) {
      const { data: existing } = await supabase
        .from('work_logs')
        .select('id')
        .eq('external_id', log.externalId)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }
    }

    const logId = crypto.randomUUID();

    const { error: logErr } = await supabase.from('work_logs').insert({
      id: logId,
      external_id: log.externalId ?? null,
      work_date: log.workDate,
      weather: log.weather ?? null,
      temperature: log.temperature ?? null,
      location: log.location ?? null,
      work_desc: log.workDesc ?? null,
      total_amount: log.totalAmount ?? null,
      note: log.note ?? null,
    });
    if (logErr) { console.error('insert work_logs:', logErr.message); continue; }

    if (log.laborers.length > 0) {
      const { error } = await supabase.from('work_log_laborers').insert(
        log.laborers.map((l, i) => ({
          id: l.id || crypto.randomUUID(),
          log_id: logId,
          name: l.name,
          resident_id: l.residentId ?? null,
          company: l.company ?? null,
          daily_wage: l.dailyWage ?? null,
          note: l.note ?? null,
          sort_order: i,
        })),
      );
      if (error) console.error('insert laborers:', error.message);
    }

    if (log.items.length > 0) {
      const { error } = await supabase.from('work_log_items').insert(
        log.items.map((item, i) => ({
          id: item.id || crypto.randomUUID(),
          log_id: logId,
          category: item.category ?? null,
          detail: item.detail ?? null,
          unit: item.unit ?? null,
          qty: item.qty ?? null,
          amount: item.amount ?? null,
          note: item.note ?? null,
          sort_order: i,
        })),
      );
      if (error) console.error('insert items:', error.message);
    }

    inserted++;
  }

  console.log(`\n완료 — 삽입: ${inserted}건, 건너뜀: ${skipped}건`);
}

main().catch((err) => { console.error(err); process.exit(1); });
