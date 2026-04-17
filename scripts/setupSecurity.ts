// Idempotent security rollout script (Phase A — safe, no user-facing impact).
// Uses SUPABASE_ACCESS_TOKEN (Management API) from .env:
//   1. Fetch service_role key
//   2. Create/update operator Auth user with fresh password
//   3. Set Edge Function secrets (APP_PIN_HASH, OPERATOR_EMAIL, OPERATOR_PASSWORD)
//
// Migration 018 (RLS) is applied separately AFTER confirming PIN flow works end-to-end:
//   npx tsx scripts/runMigration.ts supabase/migrations/018_enable_rls.sql
//
// Edge Function deploy is done separately via the CLI:
//   npx supabase functions deploy pin-login --project-ref <ref>
//
// Usage:
//   npx tsx scripts/setupSecurity.ts <operator_email> <pin_hash> <operator_password>

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENV_PATH = path.resolve(PROJECT_ROOT, '.env');

function loadDotenv(p: string) {
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadDotenv(ENV_PATH);

const operatorEmail = process.argv[2];
const pinHash = process.argv[3];
const operatorPassword = process.argv[4];
if (!operatorEmail || !pinHash || !operatorPassword) {
  console.error('usage: npx tsx scripts/setupSecurity.ts <operator_email> <pin_hash> <operator_password>');
  process.exit(1);
}

const accessToken = process.env['SUPABASE_ACCESS_TOKEN'];
const supabaseUrl = process.env['VITE_SUPABASE_URL'];
if (!accessToken) { console.error('SUPABASE_ACCESS_TOKEN 없음 (.env)'); process.exit(1); }
if (!supabaseUrl) { console.error('VITE_SUPABASE_URL 없음 (.env)'); process.exit(1); }

const m = supabaseUrl.match(/^https?:\/\/([^.]+)\.supabase\.co/);
if (!m) { console.error('project ref 추출 실패'); process.exit(1); }
const projectRef = m[1];

async function mg<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.supabase.com/v1${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Management API ${method} ${path} failed (${res.status}): ${text}`);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

async function getServiceRoleKey(): Promise<string> {
  const keys = await mg<Array<{ name: string; api_key: string }>>(
    'GET',
    `/projects/${projectRef}/api-keys?reveal=true`
  );
  const sr = keys.find((k) => k.name === 'service_role');
  if (!sr) throw new Error('service_role key not found');
  return sr.api_key;
}

async function gotrue(
  method: string,
  path: string,
  serviceKey: string,
  body?: unknown
): Promise<Response> {
  return fetch(`${supabaseUrl}/auth/v1${path}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function ensureOperatorUser(serviceKey: string, email: string, password: string) {
  // Find existing user by email (paginated list; we filter client-side since
  // GoTrue admin API doesn't have a direct "find by email" filter in all versions)
  const listRes = await gotrue('GET', `/admin/users?per_page=200`, serviceKey);
  if (!listRes.ok) {
    throw new Error(`admin list users failed (${listRes.status}): ${await listRes.text()}`);
  }
  const body = (await listRes.json()) as { users: Array<{ id: string; email: string }> };
  const existing = body.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  if (existing) {
    const upd = await gotrue('PUT', `/admin/users/${existing.id}`, serviceKey, {
      password,
      email_confirm: true,
    });
    if (!upd.ok) {
      throw new Error(`update user failed (${upd.status}): ${await upd.text()}`);
    }
    console.log(`✓ operator user updated (id=${existing.id})`);
    return existing.id;
  }

  const cre = await gotrue('POST', `/admin/users`, serviceKey, {
    email,
    password,
    email_confirm: true,
  });
  if (!cre.ok) {
    throw new Error(`create user failed (${cre.status}): ${await cre.text()}`);
  }
  const u = (await cre.json()) as { id: string };
  console.log(`✓ operator user created (id=${u.id})`);
  return u.id;
}

async function setFunctionSecrets(secrets: Record<string, string>) {
  const body = Object.entries(secrets).map(([name, value]) => ({ name, value }));
  await mg('POST', `/projects/${projectRef}/secrets`, body);
  console.log(`✓ secrets set: ${Object.keys(secrets).join(', ')}`);
}

async function main() {
  console.log(`project: ${projectRef}`);
  console.log(`operator: ${operatorEmail}\n`);

  console.log('1/3 fetching service_role key…');
  const serviceKey = await getServiceRoleKey();

  console.log('2/3 upserting operator user…');
  await ensureOperatorUser(serviceKey, operatorEmail, operatorPassword);

  console.log('3/3 setting Edge Function secrets…');
  await setFunctionSecrets({
    APP_PIN_HASH: pinHash,
    OPERATOR_EMAIL: operatorEmail,
    OPERATOR_PASSWORD: operatorPassword,
  });

  console.log('\n✓ Phase A 완료.');
  console.log('다음:');
  console.log('  1) npx supabase functions deploy pin-login --project-ref ' + projectRef);
  console.log('  2) 클라이언트 배포 후 PIN 동작 확인');
  console.log('  3) npx tsx scripts/runMigration.ts supabase/migrations/018_enable_rls.sql');
}

main().catch((e) => {
  console.error('\n실패:', e.message);
  process.exit(1);
});
