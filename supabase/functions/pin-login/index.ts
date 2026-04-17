// Supabase Edge Function: pin-login
// PIN 해시를 서버에서 검증하고, 성공 시 공유 operator 계정의 세션을 반환한다.
// 클라이언트는 받은 access_token / refresh_token 을 supabase.auth.setSession() 에 주입한다.
//
// 필요 환경변수 (대시보드 Edge Functions → pin-login → Secrets):
//   APP_PIN_HASH        SHA-256 hex of the PIN
//   OPERATOR_EMAIL      shared operator auth user email
//   OPERATOR_PASSWORD   shared operator auth user password
// 자동 주입:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const expected = Deno.env.get('APP_PIN_HASH');
  const operatorEmail = Deno.env.get('OPERATOR_EMAIL');
  const operatorPassword = Deno.env.get('OPERATOR_PASSWORD');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (
    !expected ||
    !operatorEmail ||
    !operatorPassword ||
    !supabaseUrl ||
    !serviceKey
  ) {
    console.error('pin-login: missing env vars');
    return json({ error: 'server misconfigured' }, 500);
  }

  let pin = '';
  try {
    const body = await req.json();
    pin = typeof body?.pin === 'string' ? body.pin : '';
  } catch {
    return json({ error: 'invalid json' }, 400);
  }
  if (!pin) return json({ error: 'pin required' }, 400);

  const pinHash = await sha256Hex(pin);
  if (pinHash !== expected) {
    await new Promise((r) => setTimeout(r, 1000));
    return json({ error: 'invalid pin' }, 401);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.signInWithPassword({
    email: operatorEmail,
    password: operatorPassword,
  });
  if (error || !data.session) {
    console.error('pin-login: signInWithPassword failed', error);
    return json({ error: 'login failed' }, 500);
  }

  return json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
  });
});
