import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.resolve(PROJECT_ROOT, '.env');

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

const token = process.env['SUPABASE_ACCESS_TOKEN']!;
const supabaseUrl = process.env['VITE_SUPABASE_URL']!;
const projectRef = supabaseUrl.match(/^https?:\/\/([^.]+)\.supabase\.co/)![1];

async function q(query: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return JSON.parse(await res.text());
}

console.log('work_logs count:', await q('SELECT COUNT(*)::int FROM work_logs'));
console.log('work_log_laborers count:', await q('SELECT COUNT(*)::int FROM work_log_laborers'));
console.log('work_log_items count:', await q('SELECT COUNT(*)::int FROM work_log_items'));
console.log('\n월별 집계:');
console.log(await q(`SELECT to_char(work_date, 'YYYY-MM') AS month, COUNT(*)::int AS logs FROM work_logs GROUP BY month ORDER BY month`));
