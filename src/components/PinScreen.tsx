import { useState } from 'react';

const PIN = '1124';
const SESSION_KEY = 'papa_01_authed';

export function isAuthed(): boolean {
  return sessionStorage.getItem(SESSION_KEY) === 'true';
}

export function setAuthed() {
  sessionStorage.setItem(SESSION_KEY, 'true');
}

interface Props {
  onSuccess: () => void;
}

export default function PinScreen({ onSuccess }: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const submit = () => {
    if (pin === PIN) {
      setAuthed();
      onSuccess();
    } else {
      setError(true);
      setPin('');
    }
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
              setError(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className={`w-full px-4 py-3 text-center text-xl tracking-widest rounded-xl border
              bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
              placeholder:text-gray-300 dark:placeholder:text-gray-600
              ${error
                ? 'border-red-400 dark:border-red-500 ring-1 ring-red-300 dark:ring-red-500/30'
                : 'border-gray-300 dark:border-gray-600'
              }`}
            placeholder="····"
            autoFocus
          />
          {error && (
            <p className="text-red-500 dark:text-red-400 text-sm text-center mt-2">
              비밀번호가 틀렸습니다
            </p>
          )}
          <button
            onClick={submit}
            className="w-full mt-4 bg-blue-600 text-white py-3 rounded-xl font-medium
              cursor-pointer active:bg-blue-700"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
