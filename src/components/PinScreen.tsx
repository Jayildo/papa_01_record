import { useState } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
  onSuccess: () => void;
}

async function loginWithPin(pin: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('pin-login', {
    body: { pin },
  });
  if (error) {
    const status = (error as { context?: Response }).context?.status;
    if (status === 401) return '비밀번호가 틀렸습니다';
    return '서버 연결 실패. 잠시 후 다시 시도해주세요';
  }
  const session = data as
    | { access_token?: string; refresh_token?: string }
    | null;
  if (!session?.access_token || !session?.refresh_token) {
    return '로그인 실패';
  }
  const { error: setErr } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (setErr) return '세션 적용 실패. 다시 시도해주세요';
  return null;
}

export default function PinScreen({ onSuccess }: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy || !pin) return;
    setBusy(true);
    const msg = await loginWithPin(pin);
    if (msg === null) {
      onSuccess();
    } else {
      setError(msg);
      setPin('');
    }
    setBusy(false);
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="w-full max-w-xs">
        <h1 className="text-xl font-bold text-center mb-8 text-gray-900 dark:text-gray-100">
          수목 전정 현황
        </h1>
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-200 dark:border-gray-700">
          <label className="block text-sm text-gray-500 dark:text-gray-400 mb-2">비밀번호</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={10}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            disabled={busy}
            className={`w-full px-4 py-3 text-center text-xl tracking-widest rounded-xl border
              bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
              placeholder:text-gray-300 dark:placeholder:text-gray-600
              disabled:opacity-60
              ${error
                ? 'border-red-400 dark:border-red-500 ring-1 ring-red-300 dark:ring-red-500/30'
                : 'border-gray-300 dark:border-gray-600'
              }`}
            placeholder="······"
            autoFocus
          />
          {error && (
            <p className="text-red-500 dark:text-red-400 text-sm text-center mt-2">
              {error}
            </p>
          )}
          <button
            onClick={submit}
            disabled={busy || !pin}
            className="w-full mt-4 bg-blue-600 text-white py-3 rounded-xl font-medium
              cursor-pointer active:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? '확인 중…' : '확인'}
          </button>
        </div>
      </div>
    </div>
  );
}
