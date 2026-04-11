// Run a SQL migration file against Supabase via the Management API.
// Usage: npx tsx scripts/runMigration.ts supabase/migrations/014_worklog_base.sql

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

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error('usage: npx tsx scripts/runMigration.ts <path-to-sql>');
  process.exit(1);
}

const token = process.env['SUPABASE_ACCESS_TOKEN'];
const supabaseUrl = process.env['VITE_SUPABASE_URL'];
if (!token) { console.error('SUPABASE_ACCESS_TOKEN 없음'); process.exit(1); }
if (!supabaseUrl) { console.error('VITE_SUPABASE_URL 없음'); process.exit(1); }

const m = supabaseUrl.match(/^https?:\/\/([^.]+)\.supabase\.co/);
if (!m) { console.error('project ref 를 추출할 수 없음:', supabaseUrl); process.exit(1); }
const projectRef = m[1];

const sqlPath = path.resolve(PROJECT_ROOT, sqlFile);
const query = fs.readFileSync(sqlPath, 'utf-8');

console.log(`project: ${projectRef}`);
console.log(`sql file: ${sqlPath}`);
console.log(`bytes: ${query.length}\n`);

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query }),
});

const bodyText = await res.text();
if (!res.ok) {
  console.error(`실패 (${res.status}):\n${bodyText}`);
  process.exit(1);
}
console.log(`성공 (${res.status})`);
if (bodyText && bodyText !== '[]') console.log(bodyText);
